import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'
import { notify } from '../lib/notify'
import { SUBSCRIPTION_PAGE, addMonths, cancelOpenInvoice, createInvoice, formatBr } from '../lib/billing'

const DAY_MS = 24 * 60 * 60 * 1000

/** Quantos dias antes do vencimento a mensalidade é gerada e enviada. */
const INVOICE_LEAD_DAYS = 5
/** Intervalo entre lembretes de mensalidade atrasada. */
const OVERDUE_REMINDER_EVERY_DAYS = 3
/** Dias de atraso até o plano ser marcado como vencido. */
const GRACE_DAYS = 10
/** Assinatura que nunca pagou a 1ª mensalidade é descartada após estes dias. */
const PENDING_TIMEOUT_DAYS = 7

/**
 * Régua de cobrança, todo dia às 9h:
 * - zera os créditos quando começa o mês pago;
 * - gera a mensalidade do próximo mês (link InfinitePay) e avisa o cliente;
 * - avisa na véspera do vencimento;
 * - no atraso, marca "em atraso" e avisa dono + cliente, com lembretes;
 * - passado o prazo de tolerância, marca o plano como vencido.
 */
export const dailyBilling = onSchedule(
  { region: REGION, schedule: '0 9 * * *', timeZone: 'America/Sao_Paulo' },
  async () => {
    const snap = await db
      .collection('subscriptions')
      .where('status', 'in', ['pending', 'active', 'past_due'])
      .get()

    for (const doc of snap.docs) {
      try {
        await processSubscription(doc)
      } catch (err) {
        logger.error('Falha na régua de cobrança', { subscriptionId: doc.id, err })
      }
    }
  },
)

async function processSubscription(doc: QueryDocumentSnapshot) {
  const sub = doc.data()
  const now = new Date()

  if (sub.status === 'pending') {
    const created = sub.createdAt?.toDate?.() as Date | undefined
    if (created && now.getTime() - created.getTime() > PENDING_TIMEOUT_DAYS * DAY_MS) {
      await cancelOpenInvoice(doc.ref, sub.openInvoice?.id)
      await doc.ref.update({ status: 'canceled', canceledAt: FieldValue.serverTimestamp() })
    }
    return
  }

  const periodEnd = sub.currentPeriodEnd?.toDate?.() as Date | undefined
  if (!periodEnd) return

  // 1) Começou o mês já pago → créditos novos.
  const creditsResetAt = sub.creditsResetAt?.toDate?.() as Date | undefined
  if (
    sub.status === 'active' &&
    creditsResetAt &&
    creditsResetAt.getTime() <= now.getTime() &&
    creditsResetAt.getTime() < periodEnd.getTime()
  ) {
    await doc.ref.update({
      usage: {},
      currentPeriodStart: Timestamp.fromDate(creditsResetAt),
      creditsResetAt: Timestamp.fromDate(addMonths(creditsResetAt, 1)),
    })
  }

  // 2) Sem cobrança em aberto e vencimento chegando → gera a próxima mensalidade.
  if (!sub.openInvoice) {
    if (periodEnd.getTime() - now.getTime() <= INVOICE_LEAD_DAYS * DAY_MS) {
      await createInvoice({
        subRef: doc.ref,
        sub: {
          clientId: sub.clientId,
          clientName: sub.clientName,
          planName: sub.planName,
          planPrice: sub.planPrice,
        },
        kind: 'renewal',
        dueDate: periodEnd,
        periodStart: periodEnd,
        periodEnd: addMonths(periodEnd, 1),
      })
      await notify({
        type: 'invoice_created',
        targetUserId: sub.clientId,
        relatedId: doc.id,
        link: SUBSCRIPTION_PAGE,
        title: 'Sua mensalidade chegou',
        message: `A mensalidade do plano "${sub.planName}" vence em ${formatBr(periodEnd)}. Toque para pagar por Pix ou cartão.`,
      })
    }
    return
  }

  // 3) Cobrança em aberto: véspera, atraso, lembretes e vencimento do plano.
  const invoiceRef = db.collection('invoices').doc(sub.openInvoice.id)
  const invoiceSnap = await invoiceRef.get()
  const invoice = invoiceSnap.data()
  if (!invoice || invoice.status === 'paid' || invoice.status === 'canceled') {
    await doc.ref.update({ openInvoice: null })
    return
  }

  const due = (invoice.dueDate as Timestamp).toDate()
  const msToDue = due.getTime() - now.getTime()

  if (msToDue > 0) {
    if (msToDue <= DAY_MS && !invoice.dueSoonNotified) {
      await invoiceRef.update({ dueSoonNotified: true })
      await notify({
        type: 'plan_expiring',
        targetUserId: sub.clientId,
        relatedId: doc.id,
        link: SUBSCRIPTION_PAGE,
        title: 'Mensalidade vence amanhã',
        message: `Sua mensalidade do plano "${sub.planName}" vence em ${formatBr(due)}. Pague para não perder os benefícios.`,
      })
    }
    return
  }

  const daysLate = Math.floor(-msToDue / DAY_MS)
  const valor = Number(invoice.amount).toFixed(2).replace('.', ',')

  if (sub.status === 'active') {
    await invoiceRef.update({ status: 'overdue', lastReminderAt: Timestamp.fromDate(now) })
    await doc.ref.update({ status: 'past_due', 'openInvoice.overdue': true })
    await notify({
      type: 'payment_overdue',
      targetRole: 'owner',
      relatedId: doc.id,
      title: 'Mensalidade em atraso',
      message: `${sub.clientName} não pagou a mensalidade de R$ ${valor} (${sub.planName}), vencida em ${formatBr(due)}.`,
    })
    await notify({
      type: 'payment_overdue',
      targetUserId: sub.clientId,
      relatedId: doc.id,
      link: SUBSCRIPTION_PAGE,
      title: 'Mensalidade em atraso',
      message: `Sua mensalidade do plano "${sub.planName}" venceu em ${formatBr(due)}. Os benefícios ficam pausados até o pagamento. Toque para pagar.`,
    })
    return
  }

  // sub.status === 'past_due'
  if (daysLate >= GRACE_DAYS) {
    await doc.ref.update({ status: 'expired' })
    await notify({
      type: 'plan_expired',
      targetRole: 'owner',
      relatedId: doc.id,
      title: 'Plano vencido por falta de pagamento',
      message: `${sub.clientName} está há ${daysLate} dias sem pagar (${sub.planName}). O plano foi marcado como vencido.`,
    })
    await notify({
      type: 'plan_expired',
      targetUserId: sub.clientId,
      relatedId: doc.id,
      link: SUBSCRIPTION_PAGE,
      title: 'Seu plano venceu',
      message: `Seu plano "${sub.planName}" venceu por falta de pagamento. Pague a mensalidade em aberto para reativar.`,
    })
    return
  }

  const lastReminder = (invoice.lastReminderAt as Timestamp | null)?.toDate()
  if (!lastReminder || now.getTime() - lastReminder.getTime() >= OVERDUE_REMINDER_EVERY_DAYS * DAY_MS - 60 * 60 * 1000) {
    await invoiceRef.update({
      lastReminderAt: Timestamp.fromDate(now),
      reminders: FieldValue.increment(1),
    })
    await notify({
      type: 'payment_overdue',
      targetUserId: sub.clientId,
      relatedId: doc.id,
      link: SUBSCRIPTION_PAGE,
      title: 'Lembrete: mensalidade em atraso',
      message: `Sua mensalidade do plano "${sub.planName}" está ${daysLate} dia(s) atrasada. Faltam ${GRACE_DAYS - daysLate} dia(s) para o plano vencer.`,
    })
  }
}
