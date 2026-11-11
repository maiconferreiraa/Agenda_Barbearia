import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore'
import { db } from './admin'
import { APP_BASE_URL } from './params'
import { createCheckoutLink } from './infinitepay'
import { notify } from './notify'

/**
 * Mensalidades com InfinitePay.
 *
 * Cada mês vira um documento em `invoices` com um link de pagamento próprio
 * (o id do documento é o order_nsu enviado à InfinitePay). A cobrança em
 * aberto também fica resumida na assinatura (`openInvoice`) para o app
 * mostrar o botão "Pagar" sem precisar de outra consulta.
 */

export type InvoiceKind = 'first' | 'renewal'

export const SUBSCRIPTION_PAGE = '/app/subscription'

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime())
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  // 31/01 + 1 mês → último dia de fevereiro, não 03/03
  if (d.getDate() < day) d.setDate(0)
  return d
}

function baseUrl() {
  return APP_BASE_URL.value() || 'http://localhost:5173'
}

export function formatBr(date: Date) {
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

interface SubData {
  clientId: string
  clientName: string
  planName: string
  planPrice: number
}

/**
 * Cria a cobrança no Firestore + link na InfinitePay e grava o resumo na assinatura.
 * `periodStart`/`periodEnd` são o mês que essa cobrança paga.
 */
export async function createInvoice(params: {
  subRef: DocumentReference
  sub: SubData
  kind: InvoiceKind
  dueDate: Date
  periodStart: Date
  periodEnd: Date
}) {
  const { subRef, sub, kind, dueDate, periodStart, periodEnd } = params
  const invoiceRef = db.collection('invoices').doc()

  const userSnap = await db.collection('users').doc(sub.clientId).get()
  const user = userSnap.data() ?? {}
  const phone = typeof user.phone === 'string' ? user.phone.replace(/\D/g, '') : ''

  const checkoutUrl = await createCheckoutLink({
    orderNsu: invoiceRef.id,
    amount: sub.planPrice,
    description: `${sub.planName} - ${formatBr(periodStart)} a ${formatBr(periodEnd)}`,
    customer: {
      name: sub.clientName,
      ...(user.email ? { email: user.email as string } : {}),
      ...(phone.length >= 10 ? { phone_number: `+55${phone.replace(/^55/, '')}` } : {}),
    },
    redirectUrl: `${baseUrl()}${SUBSCRIPTION_PAGE}`,
    webhookUrl: `${baseUrl()}/api/infinitepay-webhook`,
  })

  const invoice = {
    subscriptionId: subRef.id,
    clientId: sub.clientId,
    clientName: sub.clientName,
    planName: sub.planName,
    amount: sub.planPrice,
    kind,
    status: 'open' as const,
    checkoutUrl,
    dueDate: Timestamp.fromDate(dueDate),
    periodStart: Timestamp.fromDate(periodStart),
    periodEnd: Timestamp.fromDate(periodEnd),
    reminders: 0,
    lastReminderAt: null,
    createdAt: FieldValue.serverTimestamp(),
  }

  await invoiceRef.set(invoice)
  await subRef.update({
    openInvoice: {
      id: invoiceRef.id,
      checkoutUrl,
      amount: sub.planPrice,
      dueDate: invoice.dueDate,
      overdue: false,
    },
  })

  return { invoiceRef, checkoutUrl }
}

/**
 * Dá baixa numa cobrança paga (chamado pelo webhook e pela confirmação do retorno
 * do checkout). Idempotente: se já estiver paga, não faz nada e devolve false.
 */
export async function markInvoicePaid(
  invoiceId: string,
  payment: {
    transactionNsu: string
    slug: string
    paidAmount: number | null
    installments: number | null
    captureMethod: string | null
    receiptUrl?: string | null
  },
): Promise<boolean> {
  const invoiceRef = db.collection('invoices').doc(invoiceId)
  const now = new Date()

  const result = await db.runTransaction(async (tx) => {
    const invSnap = await tx.get(invoiceRef)
    if (!invSnap.exists) return null
    const inv = invSnap.data()!
    if (inv.status === 'paid') return null

    const subRef = db.collection('subscriptions').doc(inv.subscriptionId)
    const subSnap = await tx.get(subRef)
    const sub = subSnap.data()
    const wasCanceled = inv.status === 'canceled' || !sub || sub.status === 'canceled'

    tx.update(invoiceRef, {
      status: 'paid',
      paidAt: Timestamp.fromDate(now),
      transactionNsu: payment.transactionNsu,
      invoiceSlug: payment.slug,
      paidAmount: payment.paidAmount ?? inv.amount,
      installments: payment.installments,
      captureMethod: payment.captureMethod,
      receiptUrl: payment.receiptUrl ?? null,
    })

    tx.set(db.collection('payments').doc(invoiceId), {
      subscriptionId: inv.subscriptionId,
      invoiceId,
      clientId: inv.clientId,
      clientName: inv.clientName,
      amount: payment.paidAmount ?? inv.amount,
      status: 'approved',
      transactionNsu: payment.transactionNsu,
      captureMethod: payment.captureMethod,
      receiptUrl: payment.receiptUrl ?? null,
      description: `Mensalidade ${inv.planName}`,
      paidAt: Timestamp.fromDate(now),
      createdAt: FieldValue.serverTimestamp(),
    })

    if (wasCanceled) return { inv, sub, wasCanceled }

    const currentEnd = sub!.currentPeriodEnd?.toDate?.() as Date | undefined
    const update: Record<string, unknown> = {
      status: 'active',
      openInvoice: null,
      expiringNotified: false,
    }

    if (!currentEnd || currentEnd.getTime() < now.getTime()) {
      // Primeira mensalidade, ou plano que já tinha vencido: começa um mês novo hoje.
      const end = addMonths(now, 1)
      update.currentPeriodStart = Timestamp.fromDate(now)
      update.currentPeriodEnd = Timestamp.fromDate(end)
      update.creditsResetAt = Timestamp.fromDate(end)
      update.usage = {}
    } else {
      // Renovação em dia: só estende o vencimento. Os créditos do mês
      // novo zeram no dia certo, pelo job diário (creditsResetAt).
      update.currentPeriodEnd = inv.periodEnd
    }
    tx.update(subRef, update)
    return { inv, sub, wasCanceled }
  })

  if (!result) return false
  const { inv, wasCanceled } = result
  const valor = (payment.paidAmount ?? inv.amount).toFixed(2).replace('.', ',')

  if (wasCanceled) {
    await notify({
      type: 'payment_received',
      targetRole: 'owner',
      relatedId: inv.subscriptionId,
      title: 'Pagamento de plano cancelado',
      message: `${inv.clientName} pagou R$ ${valor} de uma mensalidade já cancelada (${inv.planName}). Verifique se precisa estornar.`,
    })
    return true
  }

  await notify({
    type: 'payment_received',
    targetRole: 'owner',
    relatedId: inv.subscriptionId,
    title: 'Mensalidade paga',
    message: `${inv.clientName} pagou R$ ${valor} (${inv.planName}).`,
  })
  await notify({
    type: 'payment_received',
    targetUserId: inv.clientId,
    relatedId: inv.subscriptionId,
    link: SUBSCRIPTION_PAGE,
    title: 'Pagamento confirmado',
    message: `Recebemos a mensalidade do plano "${inv.planName}". Obrigado!`,
  })
  return true
}

/** Cancela a cobrança em aberto da assinatura (o link na InfinitePay continua existindo). */
export async function cancelOpenInvoice(subRef: DocumentReference, invoiceId: string | undefined) {
  if (invoiceId) {
    await db.collection('invoices').doc(invoiceId).update({
      status: 'canceled',
      canceledAt: FieldValue.serverTimestamp(),
    })
  }
  await subRef.update({ openInvoice: null })
}
