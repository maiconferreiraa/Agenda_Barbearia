import type { Env } from './env'
import { Firestore, type Doc } from './firestore'
import { budget } from './google'
import { notify } from './notify'
import { SUBSCRIPTION_PAGE, cancelOpenInvoice, createInvoice } from './billing'
import { DAY_MS, addMonths, brl, formatBr, sp, spDate } from './time'
import { businessInfo, firstName, queueWhatsapp } from './whatsapp'

/** Dias antes do vencimento em que a mensalidade é gerada e enviada. */
const INVOICE_LEAD_DAYS = 5
/** Intervalo entre lembretes de mensalidade atrasada. */
const OVERDUE_REMINDER_EVERY_DAYS = 3
/** Dias de atraso até o plano ser marcado como vencido. */
const GRACE_DAYS = 10
/** Assinatura que nunca pagou a 1ª mensalidade é descartada após estes dias. */
const PENDING_TIMEOUT_DAYS = 7

/** Limite seguro de chamadas externas por execução (o plano grátis permite 50). */
const BUDGET_LIMIT = 36

/** Próxima olhada: amanhã às 9h (Brasília). */
function tomorrowAt9(now: Date) {
  const p = sp(now)
  return spDate(p.year, p.month, p.day + 1, 9 * 60)
}

/**
 * Régua de cobrança. O cron chama a cada 10 min (9h–20h50); cada execução
 * pega as assinaturas com `billingNextCheck` vencido e para antes de estourar
 * o limite de chamadas. Cada assinatura é vista uma vez por dia.
 */
export async function runBilling(env: Env) {
  budget.used = 0
  const fs = new Firestore(env)
  const now = new Date()

  const due = await fs.query('subscriptions', {
    where: [{ field: 'billingNextCheck', op: '<=', value: now }],
    orderBy: { field: 'billingNextCheck' },
    limit: 10,
  })

  for (const doc of due) {
    if (budget.used >= BUDGET_LIMIT) break
    try {
      const terminal = await processSubscription(env, fs, doc, now)
      await fs.update(doc.path, { billingNextCheck: terminal ? null : tomorrowAt9(now) })
    } catch (err) {
      console.error('Falha na régua de cobrança', doc.id, String(err))
      // tenta de novo na próxima execução (daqui a ~1 h, para não travar a fila)
      await fs.update(doc.path, { billingNextCheck: new Date(now.getTime() + 60 * 60 * 1000) }).catch(() => {})
    }
  }
}

/** Devolve true quando a assinatura não precisa mais ser acompanhada. */
async function processSubscription(env: Env, fs: Firestore, doc: Doc, now: Date): Promise<boolean> {
  const sub = doc.data
  const status = sub.status as string

  if (!['pending', 'active', 'past_due'].includes(status)) return true

  if (status === 'pending') {
    const created = sub.createdAt as Date | undefined
    if (created && now.getTime() - created.getTime() > PENDING_TIMEOUT_DAYS * DAY_MS) {
      await cancelOpenInvoice(fs, doc.id, (sub.openInvoice as { id?: string } | null)?.id)
      await fs.update(doc.path, { status: 'canceled', canceledAt: now })
      return true
    }
    return false
  }

  const periodEnd = sub.currentPeriodEnd as Date | undefined
  if (!periodEnd) return false

  // 1) Começou o mês já pago → créditos novos.
  const creditsResetAt = sub.creditsResetAt as Date | undefined
  if (
    status === 'active' &&
    creditsResetAt &&
    creditsResetAt.getTime() <= now.getTime() &&
    creditsResetAt.getTime() < periodEnd.getTime()
  ) {
    await fs.update(doc.path, {
      usage: {},
      currentPeriodStart: creditsResetAt,
      creditsResetAt: addMonths(creditsResetAt, 1),
    })
  }

  // 1b) Cliente cancelou pelo app: vale até o fim do mês pago, sem novas cobranças.
  if (sub.cancelAtPeriodEnd) {
    if (status === 'active' && periodEnd.getTime() <= now.getTime()) {
      await fs.update(doc.path, { status: 'canceled', canceledAt: now, canceledBy: 'client' })
      await notify(env, fs, {
        type: 'plan_canceled',
        targetUserId: String(sub.clientId),
        relatedId: doc.id,
        link: SUBSCRIPTION_PAGE,
        title: 'Plano encerrado',
        message: `Seu plano "${sub.planName}" foi encerrado, como você pediu. Obrigado por ter sido assinante!`,
      })
      return true
    }
    return false
  }

  const open = sub.openInvoice as { id: string; checkoutUrl: string } | null | undefined
  const shop = await businessInfo(fs)
  const clientPhone = async () => (await fs.get(`users/${sub.clientId}`))?.data.phone

  // 2) Sem cobrança em aberto e vencimento chegando → gera a próxima mensalidade.
  if (!open) {
    if (periodEnd.getTime() - now.getTime() <= INVOICE_LEAD_DAYS * DAY_MS) {
      // Upgrade esperando pagamento perde a validade quando chega a mensalidade nova.
      const pending = sub.pendingUpgrade as { invoiceId?: string } | null | undefined
      if (pending) {
        await fs.commit([
          ...(pending.invoiceId ? [fs.updateWrite(`invoices/${pending.invoiceId}`, { status: 'canceled', canceledAt: now })] : []),
          fs.updateWrite(doc.path, { pendingUpgrade: null }),
        ])
      }
      const { checkoutUrl } = await createInvoice(env, fs, {
        subId: doc.id,
        sub,
        kind: 'renewal',
        dueDate: periodEnd,
        periodStart: periodEnd,
        periodEnd: addMonths(periodEnd, 1),
      })
      await notify(env, fs, {
        type: 'invoice_created',
        targetUserId: String(sub.clientId),
        relatedId: doc.id,
        link: SUBSCRIPTION_PAGE,
        title: 'Sua mensalidade chegou',
        message: `A mensalidade do plano "${sub.planName}" vence em ${formatBr(periodEnd)}. Toque para pagar por Pix ou cartão.`,
      })
      await queueWhatsapp(fs, {
        phone: await clientPhone(),
        kind: 'invoice_created',
        relatedId: doc.id,
        text:
          `Olá, ${firstName(sub.clientName)}! 💈\n\n` +
          `Sua mensalidade do plano *${sub.planName}* (${brl(sub.planPrice)}) vence em *${formatBr(periodEnd)}*.\n\n` +
          `Pague por Pix ou cartão neste link:\n${checkoutUrl}\n\n${shop.name}`,
      })
    }
    return false
  }

  // 3) Cobrança em aberto: véspera, atraso, lembretes e vencimento do plano.
  const invPath = `invoices/${open.id}`
  const invoice = (await fs.get(invPath))?.data
  if (!invoice || invoice.status === 'paid' || invoice.status === 'canceled') {
    await fs.update(doc.path, { openInvoice: null })
    return false
  }

  const dueDate = invoice.dueDate as Date
  const msToDue = dueDate.getTime() - now.getTime()
  const payLink = open.checkoutUrl

  if (msToDue > 0) {
    if (msToDue <= DAY_MS && !invoice.dueSoonNotified) {
      await fs.update(invPath, { dueSoonNotified: true })
      await notify(env, fs, {
        type: 'plan_expiring',
        targetUserId: String(sub.clientId),
        relatedId: doc.id,
        link: SUBSCRIPTION_PAGE,
        title: 'Mensalidade vence amanhã',
        message: `Sua mensalidade do plano "${sub.planName}" vence em ${formatBr(dueDate)}. Pague para não perder os benefícios.`,
      })
      await queueWhatsapp(fs, {
        phone: await clientPhone(),
        kind: 'due_soon',
        relatedId: doc.id,
        text:
          `Oi, ${firstName(sub.clientName)}! Lembrete: sua mensalidade do plano *${sub.planName}* ` +
          `(${brl(invoice.amount)}) vence em *${formatBr(dueDate)}*.\n\n` +
          `Link para pagar:\n${payLink}\n\nSe já pagou, pode ignorar. ${shop.name}`,
      })
    }
    return false
  }

  const daysLate = Math.floor(-msToDue / DAY_MS)

  if (status === 'active') {
    await fs.commit([
      fs.updateWrite(invPath, { status: 'overdue', lastReminderAt: now }),
      fs.updateWrite(doc.path, { status: 'past_due', 'openInvoice.overdue': true }),
    ])
    await notify(env, fs, {
      type: 'payment_overdue',
      targetRole: 'owner',
      relatedId: doc.id,
      title: 'Mensalidade em atraso',
      message: `${sub.clientName} não pagou a mensalidade de ${brl(invoice.amount)} (${sub.planName}), vencida em ${formatBr(dueDate)}.`,
    })
    await notify(env, fs, {
      type: 'payment_overdue',
      targetUserId: String(sub.clientId),
      relatedId: doc.id,
      link: SUBSCRIPTION_PAGE,
      title: 'Mensalidade em atraso',
      message: `Sua mensalidade do plano "${sub.planName}" venceu em ${formatBr(dueDate)}. Os benefícios ficam pausados até o pagamento. Toque para pagar.`,
    })
    await queueWhatsapp(fs, {
      phone: await clientPhone(),
      kind: 'payment_overdue',
      relatedId: doc.id,
      text:
        `Olá, ${firstName(sub.clientName)}. Sua mensalidade do plano *${sub.planName}* ` +
        `(${brl(invoice.amount)}) do dia *${formatBr(dueDate)}* está em atraso.\n\n` +
        `Os benefícios do plano ficam pausados até o pagamento. Regularize pelo link:\n${payLink}\n\n${shop.name}`,
    })
    await queueWhatsapp(fs, {
      phone: shop.phone,
      kind: 'payment_overdue_owner',
      relatedId: doc.id,
      text: `🚨 Mensalidade em atraso: ${sub.clientName} — ${sub.planName} (${brl(invoice.amount)}), vencida em ${formatBr(dueDate)}.`,
    })
    return false
  }

  // status === 'past_due'
  if (daysLate >= GRACE_DAYS) {
    await fs.update(doc.path, { status: 'expired' })
    await notify(env, fs, {
      type: 'plan_expired',
      targetRole: 'owner',
      relatedId: doc.id,
      title: 'Plano vencido por falta de pagamento',
      message: `${sub.clientName} está há ${daysLate} dias sem pagar (${sub.planName}). O plano foi marcado como vencido.`,
    })
    await notify(env, fs, {
      type: 'plan_expired',
      targetUserId: String(sub.clientId),
      relatedId: doc.id,
      link: SUBSCRIPTION_PAGE,
      title: 'Seu plano venceu',
      message: `Seu plano "${sub.planName}" venceu por falta de pagamento. Pague a mensalidade em aberto para reativar.`,
    })
    await queueWhatsapp(fs, {
      phone: await clientPhone(),
      kind: 'plan_expired',
      relatedId: doc.id,
      text:
        `Olá, ${firstName(sub.clientName)}. Seu plano *${sub.planName}* venceu por falta de pagamento ` +
        `(${daysLate} dias de atraso).\n\nPara reativar, é só pagar a mensalidade:\n${payLink}\n\n${shop.name}`,
    })
    return true
  }

  const lastReminder = invoice.lastReminderAt as Date | null | undefined
  if (!lastReminder || now.getTime() - lastReminder.getTime() >= OVERDUE_REMINDER_EVERY_DAYS * DAY_MS - 60 * 60 * 1000) {
    await fs.update(invPath, { lastReminderAt: now, reminders: Number(invoice.reminders ?? 0) + 1 })
    await notify(env, fs, {
      type: 'payment_overdue',
      targetUserId: String(sub.clientId),
      relatedId: doc.id,
      link: SUBSCRIPTION_PAGE,
      title: 'Lembrete: mensalidade em atraso',
      message: `Sua mensalidade do plano "${sub.planName}" está ${daysLate} dia(s) atrasada. Faltam ${GRACE_DAYS - daysLate} dia(s) para o plano vencer.`,
    })
    await queueWhatsapp(fs, {
      phone: await clientPhone(),
      kind: 'overdue_reminder',
      relatedId: doc.id,
      text:
        `Oi, ${firstName(sub.clientName)}. Sua mensalidade do plano *${sub.planName}* está com ` +
        `${daysLate} dia(s) de atraso. Faltam ${GRACE_DAYS - daysLate} dia(s) para o plano vencer.\n\n` +
        `Link para pagar:\n${payLink}\n\n${shop.name}`,
    })
  }
  return false
}
