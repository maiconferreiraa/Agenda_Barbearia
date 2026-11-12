import type { Env } from './env'
import type { Data, Firestore } from './firestore'
import { createCheckoutLink, savedHandle } from './infinitepay'
import { notify } from './notify'
import { addMonths, brl, formatBr } from './time'
import { businessInfo, firstName, queueWhatsapp } from './whatsapp'

/**
 * Mensalidades com InfinitePay: cada mês é um documento em `invoices` com link
 * próprio (id do documento = order_nsu). O resumo da cobrança em aberto fica na
 * assinatura (`openInvoice`) para o app mostrar o botão "Pagar".
 *
 * `billingNextCheck` na assinatura diz quando a régua diária deve olhar para
 * ela de novo (a régua roda em pedaços — ver scheduled.ts).
 */
export const SUBSCRIPTION_PAGE = '/app/subscription'

export function webhookUrl(env: Env) {
  return `${env.APP_BASE_URL}/api/infinitepay-webhook`
}

export async function createInvoice(
  env: Env,
  fs: Firestore,
  params: {
    subId: string
    sub: Data
    kind: 'first' | 'renewal' | 'upgrade'
    dueDate: Date
    periodStart: Date
    periodEnd: Date
    /** Valor diferente do plano (upgrade cobra só a diferença). */
    amount?: number
    description?: string
    /** Campos a mais gravados na cobrança (ex.: plano de destino do upgrade). */
    extra?: Data
  },
) {
  const { subId, sub, kind, dueDate, periodStart, periodEnd } = params
  const amount = params.amount ?? Number(sub.planPrice)
  const handle = await savedHandle(fs)
  if (!handle) throw new Error('InfiniteTag não configurada (Configurações → Pagamentos).')

  const invoiceId = fs.newId()
  const user = (await fs.get(`users/${sub.clientId}`))?.data ?? {}
  const phone = typeof user.phone === 'string' ? user.phone.replace(/\D/g, '').replace(/^55/, '') : ''

  const checkoutUrl = await createCheckoutLink({
    handle,
    orderNsu: invoiceId,
    amount,
    description: params.description ?? `${sub.planName} - ${formatBr(periodStart)} a ${formatBr(periodEnd)}`,
    customer: {
      name: String(sub.clientName ?? ''),
      ...(typeof user.email === 'string' ? { email: user.email } : {}),
      ...(phone.length >= 10 ? { phone_number: `+55${phone}` } : {}),
    },
    redirectUrl: `${env.APP_BASE_URL}${SUBSCRIPTION_PAGE}`,
    webhookUrl: webhookUrl(env),
  })

  await fs.commit([
    fs.createWrite(`invoices/${invoiceId}`, {
      subscriptionId: subId,
      clientId: sub.clientId,
      clientName: sub.clientName,
      planName: sub.planName,
      amount,
      kind,
      ...(params.extra ?? {}),
      status: 'open',
      checkoutUrl,
      dueDate,
      periodStart,
      periodEnd,
      reminders: 0,
      lastReminderAt: null,
      createdAt: new Date(),
    }),
    kind === 'upgrade'
      ? fs.updateWrite(`subscriptions/${subId}`, {
          pendingUpgrade: {
            invoiceId,
            checkoutUrl,
            amount,
            planId: params.extra?.targetPlanId ?? null,
            planName: params.extra?.targetPlanName ?? null,
          },
        })
      : fs.updateWrite(`subscriptions/${subId}`, {
          openInvoice: { id: invoiceId, checkoutUrl, amount, dueDate, overdue: false },
        }),
  ])
  return { invoiceId, checkoutUrl }
}

/** Dá baixa numa mensalidade paga. Idempotente: devolve false se já estava paga. */
export async function markInvoicePaid(
  env: Env,
  fs: Firestore,
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
  const now = new Date()

  const result = await fs.runTransaction(async (tx) => {
    const invDoc = await tx.get(`invoices/${invoiceId}`)
    if (!invDoc) return null
    const inv = invDoc.data
    if (inv.status === 'paid') return null

    const subPath = `subscriptions/${inv.subscriptionId}`
    const sub = (await tx.get(subPath))?.data
    const wasCanceled = inv.status === 'canceled' || !sub || sub.status === 'canceled'
    const amount = payment.paidAmount ?? Number(inv.amount)
    // Taxa repassada ao cliente (configuração da conta InfinitePay): ele paga a mais
    // e a barbearia recebe o valor da mensalidade. O relatório conta o valor da mensalidade.
    const charged = Number(inv.amount)
    const feePassedToClient = amount > charged + 0.005
    const reportAmount = feePassedToClient ? charged : amount

    tx.update(`invoices/${invoiceId}`, {
      status: 'paid',
      paidAt: now,
      transactionNsu: payment.transactionNsu,
      invoiceSlug: payment.slug,
      paidAmount: amount,
      installments: payment.installments,
      captureMethod: payment.captureMethod,
      receiptUrl: payment.receiptUrl ?? null,
    })
    tx.set(`payments/${invoiceId}`, {
      subscriptionId: inv.subscriptionId,
      invoiceId,
      clientId: inv.clientId,
      clientName: inv.clientName,
      amount: reportAmount,
      paidByClient: amount,
      feePassedToClient,
      installments: payment.installments,
      status: 'approved',
      transactionNsu: payment.transactionNsu,
      captureMethod: payment.captureMethod,
      receiptUrl: payment.receiptUrl ?? null,
      kind: inv.kind ?? 'renewal',
      planName: inv.kind === 'upgrade' ? inv.targetPlanName : inv.planName,
      description: inv.kind === 'upgrade' ? `Upgrade para ${inv.targetPlanName}` : `Mensalidade ${inv.planName}`,
      paidAt: now,
      createdAt: now,
    })

    if (wasCanceled) return { inv, amount, wasCanceled }

    // Upgrade: troca o plano na hora; vencimento e créditos já usados continuam.
    if (inv.kind === 'upgrade') {
      if (sub!.status !== 'active') return { inv, amount, wasCanceled: true }
      tx.update(subPath, {
        planId: inv.targetPlanId,
        planName: inv.targetPlanName,
        planPrice: inv.targetPlanPrice,
        pendingUpgrade: null,
        upgradedAt: now,
      })
      return { inv, amount, wasCanceled: false, upgraded: true }
    }

    const currentEnd = sub!.currentPeriodEnd as Date | undefined
    const update: Data = { status: 'active', openInvoice: null, billingNextCheck: now }
    if (!currentEnd || currentEnd.getTime() < now.getTime()) {
      // 1ª mensalidade, ou plano que tinha vencido: mês novo a partir de hoje.
      const end = addMonths(now, 1)
      Object.assign(update, { currentPeriodStart: now, currentPeriodEnd: end, creditsResetAt: end, usage: {} })
    } else {
      // Renovação em dia: estende o vencimento; créditos zeram no dia certo (creditsResetAt).
      update.currentPeriodEnd = inv.periodEnd
    }
    tx.update(subPath, update)
    return { inv, amount, wasCanceled, upgraded: false }
  })

  if (!result) return false
  const { inv, amount, wasCanceled } = result

  if ('upgraded' in result && result.upgraded) {
    await notify(env, fs, {
      type: 'plan_chosen',
      targetRole: 'owner',
      relatedId: String(inv.subscriptionId),
      title: 'Upgrade de plano',
      message: `${inv.clientName} fez upgrade de "${inv.planName}" para "${inv.targetPlanName}" (pagou ${brl(amount)} de diferença).`,
    })
    await notify(env, fs, {
      type: 'payment_received',
      targetUserId: String(inv.clientId),
      relatedId: String(inv.subscriptionId),
      link: SUBSCRIPTION_PAGE,
      title: 'Upgrade confirmado',
      message: `Seu plano agora é "${inv.targetPlanName}". Os créditos novos já estão disponíveis!`,
    })
    return true
  }

  if (wasCanceled) {
    await notify(env, fs, {
      type: 'payment_received',
      targetRole: 'owner',
      relatedId: String(inv.subscriptionId),
      title: 'Pagamento de plano cancelado',
      message: `${inv.clientName} pagou ${brl(amount)} de uma mensalidade já cancelada (${inv.planName}). Verifique se precisa estornar.`,
    })
    return true
  }

  await notify(env, fs, {
    type: 'payment_received',
    targetRole: 'owner',
    relatedId: String(inv.subscriptionId),
    title: 'Mensalidade paga',
    message: `${inv.clientName} pagou ${brl(amount)} (${inv.planName}).`,
  })
  await notify(env, fs, {
    type: 'payment_received',
    targetUserId: String(inv.clientId),
    relatedId: String(inv.subscriptionId),
    link: SUBSCRIPTION_PAGE,
    title: 'Pagamento confirmado',
    message: `Recebemos a mensalidade do plano "${inv.planName}". Obrigado!`,
  })
  const [client, shop] = await Promise.all([fs.get(`users/${inv.clientId}`), businessInfo(fs)])
  await queueWhatsapp(fs, {
    phone: client?.data.phone,
    kind: 'payment_received',
    relatedId: String(inv.subscriptionId),
    text:
      `Pagamento confirmado, ${firstName(inv.clientName)}! ✅\n\n` +
      `Recebemos ${brl(amount)} da mensalidade do plano *${inv.planName}*. Obrigado!\n\n${shop.name}`,
  })
  return true
}

/** Cancela a mensalidade em aberto (o link na InfinitePay continua existindo). */
export async function cancelOpenInvoice(fs: Firestore, subId: string, invoiceId: unknown) {
  const writes = [fs.updateWrite(`subscriptions/${subId}`, { openInvoice: null })]
  if (typeof invoiceId === 'string' && invoiceId) {
    writes.unshift(fs.updateWrite(`invoices/${invoiceId}`, { status: 'canceled', canceledAt: new Date() }))
  }
  await fs.commit(writes)
}
