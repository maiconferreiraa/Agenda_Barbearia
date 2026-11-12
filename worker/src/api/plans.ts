import { ApiError } from '../env'
import type { Ctx } from './ctx'
import { requireOwner } from './ctx'
import { cancelOpenInvoice, createInvoice, markInvoicePaid } from '../billing'
import {
  InfinitePayError,
  PAYMENT_SETTINGS,
  checkPayment,
  createCheckoutLink,
  normalizeHandle,
  savedHandle,
} from '../infinitepay'
import { notify } from '../notify'
import { addMonths, formatBr } from '../time'
import { businessInfo, firstName, queueWhatsapp, retentionText } from '../whatsapp'
import { CARD_MODE, cleanRecurringLink } from './cardRecurring'

/** Lembrete pro dono quando um plano no cartão recorrente é cancelado. */
const CARD_CANCEL_TIP = '\n\n⚠️ Esse plano é no *cartão recorrente*: cancele também a recorrência no app da InfinitePay, senão o cartão continua sendo cobrado.'

/** WhatsApp do cancelamento: aviso pro dono e confirmação pro cliente. */
async function whatsCancel(
  fs: Ctx['fs'],
  sub: Record<string, unknown>,
  subId: string,
  texts: { owner?: string; client?: string; retention?: { validUntil?: string } },
) {
  const [shop, client] = await Promise.all([businessInfo(fs), fs.get(`users/${sub.clientId}`)])
  if (texts.owner) {
    await queueWhatsapp(fs, { phone: shop.phone, kind: 'plan_canceled_owner', relatedId: subId, text: texts.owner })
  }
  if (texts.retention) {
    await queueWhatsapp(fs, {
      phone: client?.data.phone,
      kind: 'plan_canceled_retention',
      relatedId: subId,
      text: `${retentionText(sub.clientName, sub.planName, shop.retentionOffer, texts.retention.validUntil)}\n\n${shop.name}`,
    })
  } else if (texts.client) {
    await queueWhatsapp(fs, {
      phone: client?.data.phone,
      kind: 'plan_canceled_client',
      relatedId: subId,
      text: `${texts.client}\n\n${shop.name}`,
    })
  }
}

function safeId(v: unknown, what: string) {
  const id = String(v ?? '')
  if (!id || id.includes('/')) throw new ApiError('invalid-argument', `${what} inválido.`)
  return id
}

/** Cliente escolhe um plano: assinatura "pending" + 1ª mensalidade na InfinitePay. */
export async function subscribePlan({ env, fs, uid, data }: Ctx) {
  const planId = safeId(data.planId, 'Plano')
  const [user, plan] = await Promise.all([fs.get(`users/${uid}`), fs.get(`plans/${planId}`)])
  if (!user) throw new ApiError('not-found', 'Usuário não encontrado.')
  if (user.data.role !== 'client') throw new ApiError('permission-denied', 'Apenas clientes podem assinar planos.')
  if (!plan || plan.data.active !== true) throw new ApiError('not-found', 'Plano indisponível.')

  const recurringLink = cleanRecurringLink(plan.data.recurringLink)
  if (!recurringLink && !(await savedHandle(fs))) {
    throw new ApiError('failed-precondition', 'A barbearia ainda não ativou o pagamento online. Fale com a barbearia.')
  }

  const existing = await fs.query('subscriptions', {
    where: [
      { field: 'clientId', op: '==', value: uid },
      { field: 'status', op: 'in', value: ['active', 'pending', 'past_due'] },
    ],
    limit: 1,
  })
  if (existing.length > 0) {
    const open = existing[0].data.openInvoice as { checkoutUrl?: string } | null
    if (existing[0].data.status === 'pending' && open?.checkoutUrl) return { checkoutUrl: open.checkoutUrl }
    throw new ApiError('already-exists', 'Você já tem uma assinatura ativa ou pendente.')
  }

  const subId = fs.newId()
  const now = new Date()
  const sub = {
    clientId: uid,
    clientName: user.data.name,
    planId,
    planName: String(plan.data.name).trim(),
    planPrice: plan.data.price,
  }

  // Cartão recorrente: o cliente vai direto pro link da InfinitePay; o dono confirma o pagamento.
  if (recurringLink) {
    await fs.create(`subscriptions/${subId}`, {
      ...sub,
      status: 'pending',
      billingMode: CARD_MODE,
      recurringLink,
      usage: {},
      openInvoice: null,
      billingNextCheck: now,
      createdAt: now,
    })
    await notify(env, fs, {
      type: 'plan_chosen',
      targetRole: 'owner',
      relatedId: subId,
      title: '💳 Novo plano no cartão recorrente',
      message: `${user.data.name} escolheu o plano "${String(plan.data.name).trim()}" no cartão. Quando o pagamento aparecer no app da InfinitePay, toque em "Confirmar pagamento" em Assinaturas.`,
    })
    const shop = await businessInfo(fs)
    await queueWhatsapp(fs, {
      phone: shop.phone,
      kind: 'card_chosen_owner',
      relatedId: subId,
      text: `💳 ${user.data.name} escolheu o plano *${String(plan.data.name).trim()}* no cartão recorrente. Quando o pagamento aparecer na InfinitePay, confirme em Assinaturas.`,
    })
    return { checkoutUrl: recurringLink, cardRecurring: true }
  }

  await fs.create(`subscriptions/${subId}`, {
    ...sub,
    status: 'pending',
    usage: {},
    openInvoice: null,
    billingNextCheck: now,
    createdAt: now,
  })

  try {
    const { checkoutUrl } = await createInvoice(env, fs, {
      subId,
      sub,
      kind: 'first',
      dueDate: now,
      periodStart: now,
      periodEnd: addMonths(now, 1),
    })
    await notify(env, fs, {
      type: 'plan_chosen',
      targetRole: 'owner',
      relatedId: subId,
      title: 'Novo plano escolhido',
      message: `${user.data.name} iniciou a assinatura do plano "${String(plan.data.name).trim()}".`,
    })
    return { checkoutUrl }
  } catch (err) {
    console.error('Falha ao criar a 1ª mensalidade', String(err))
    await fs.update(`subscriptions/${subId}`, { status: 'canceled', error: String(err), billingNextCheck: null })
    throw new ApiError('internal', 'Não foi possível gerar a cobrança na InfinitePay.')
  }
}

/** Reserva do webhook: o app manda o que a InfinitePay pôs na URL de retorno. */
export async function confirmInvoicePayment({ env, fs, uid, data }: Ctx) {
  const orderNsu = safeId(data.orderNsu, 'Pagamento')
  const transactionNsu = String(data.transactionNsu ?? '')
  const slug = String(data.slug ?? '')
  if (!transactionNsu || !slug) throw new ApiError('invalid-argument', 'Dados do pagamento incompletos.')

  const invoice = await fs.get(`invoices/${orderNsu}`)
  if (!invoice || invoice.data.clientId !== uid) throw new ApiError('not-found', 'Cobrança não encontrada.')
  if (invoice.data.status === 'paid') return { paid: true }

  const handle = await savedHandle(fs)
  if (!handle) throw new ApiError('failed-precondition', 'Pagamento online desativado.')
  const check = await checkPayment({ handle, orderNsu, transactionNsu, slug })
  if (!check.paid) return { paid: false }
  await markInvoicePaid(env, fs, orderNsu, { transactionNsu, slug, ...check })
  return { paid: true }
}

/** Dono cola a InfiniteTag e toca "Conectar": testa com um link de R$ 1,00 e salva. */
export async function connectInfinitePay(ctx: Ctx) {
  const { fs, uid, data } = ctx
  await requireOwner(ctx)

  if (data.disconnect === true) {
    await fs.set(PAYMENT_SETTINGS, { infinitePayHandle: null, connectedAt: null }, true)
    return { handle: null }
  }

  const handle = normalizeHandle(data.handle)
  if (!handle) {
    throw new ApiError(
      'invalid-argument',
      'InfiniteTag inválida. Ela aparece no app da InfinitePay e começa com $ (ex.: $barbeariaprime).',
    )
  }
  try {
    await createCheckoutLink({
      handle,
      orderNsu: `teste-conexao-${Date.now()}`,
      amount: 1,
      description: 'Teste de conexão - Barbearia Prime',
    })
  } catch (err) {
    console.warn('Teste de conexão InfinitePay falhou', handle, String(err))
    if (err instanceof InfinitePayError && err.code === 'external_checkout_not_enabled') {
      throw new ApiError(
        'failed-precondition',
        'Sua conta InfinitePay ainda não libera cobrança pelo sistema. Toque em "Ativar na InfinitePay", ative o Checkout Integrado e depois toque em Conectar de novo.',
      )
    }
    throw new ApiError(
      'failed-precondition',
      'A InfinitePay não aceitou essa InfiniteTag. Confira no app da InfinitePay e tente de novo.',
    )
  }
  await fs.set(PAYMENT_SETTINGS, { infinitePayHandle: handle, connectedAt: new Date(), connectedBy: uid }, true)
  return { handle }
}

/** Dono cancela a assinatura de um cliente. */
export async function cancelSubscription(ctx: Ctx) {
  const { env, fs, data } = ctx
  await requireOwner(ctx)
  const subId = safeId(data.subscriptionId, 'Assinatura')
  const sub = await fs.get(`subscriptions/${subId}`)
  if (!sub) throw new ApiError('not-found', 'Assinatura não encontrada.')

  await cancelOpenInvoice(fs, subId, (sub.data.openInvoice as { id?: string } | null)?.id)
  await cancelPendingUpgrade(fs, subId, sub.data.pendingUpgrade)
  await fs.update(sub.path, { status: 'canceled', canceledAt: new Date(), canceledBy: 'owner', billingNextCheck: null })
  await notify(env, fs, {
    type: 'plan_canceled',
    targetUserId: String(sub.data.clientId),
    relatedId: subId,
    title: 'Assinatura cancelada',
    message: `Sua assinatura do plano "${sub.data.planName}" foi cancelada. Não haverá novas cobranças.`,
  })
  if (sub.data.billingMode === CARD_MODE) {
    const shop = await businessInfo(fs)
    await queueWhatsapp(fs, {
      phone: shop.phone,
      kind: 'card_cancel_tip',
      relatedId: subId,
      text: `❌ Assinatura de ${sub.data.clientName} (${sub.data.planName}) cancelada.${CARD_CANCEL_TIP}`,
    })
  }
  await whatsCancel(fs, sub.data, subId, {
    client:
      `Olá, ${firstName(sub.data.clientName)}. Sua assinatura do plano *${sub.data.planName}* foi cancelada ` +
      `pela barbearia. Não haverá novas cobranças.`,
  })
  return { ok: true }
}

/**
 * Cliente cancela o próprio plano. Em dia: vale até o fim do mês pago
 * (`cancelAtPeriodEnd`), com opção de desfazer. Pendente ou em atraso: na hora.
 */
export async function cancelMyPlan({ env, fs, uid, data }: Ctx) {
  const subId = safeId(data.subscriptionId, 'Assinatura')
  const doc = await fs.get(`subscriptions/${subId}`)
  const sub = doc?.data
  if (!doc || !sub || sub.clientId !== uid) throw new ApiError('not-found', 'Assinatura não encontrada.')

  if (data.undo === true) {
    if (sub.status !== 'active' || !sub.cancelAtPeriodEnd) {
      throw new ApiError('failed-precondition', 'Não há cancelamento para desfazer.')
    }
    await fs.update(doc.path, { cancelAtPeriodEnd: false, cancelRequestedAt: null, billingNextCheck: new Date() })
    await notify(env, fs, {
      type: 'plan_chosen',
      targetRole: 'owner',
      relatedId: subId,
      title: 'Cliente manteve o plano',
      message: `${sub.clientName} desistiu de cancelar o plano "${sub.planName}".`,
    })
    await whatsCancel(fs, sub, subId, {
      owner: `✅ ${sub.clientName} desistiu de cancelar e *manteve* o plano ${sub.planName}.`,
      client: `Que bom que você ficou, ${firstName(sub.clientName)}! 💈 Seu plano *${sub.planName}* continua normalmente.`,
    })
    return { status: 'active' }
  }

  if (sub.status === 'active') {
    if (sub.cancelAtPeriodEnd) return { status: 'active' }
    await cancelOpenInvoice(fs, subId, (sub.openInvoice as { id?: string } | null)?.id)
    await cancelPendingUpgrade(fs, subId, sub.pendingUpgrade)
    await fs.update(doc.path, { cancelAtPeriodEnd: true, cancelRequestedAt: new Date() })
    const end = sub.currentPeriodEnd as Date | undefined
    await notify(env, fs, {
      type: 'plan_canceled',
      targetRole: 'owner',
      relatedId: subId,
      title: 'Cliente cancelou o plano',
      message: `${sub.clientName} cancelou o plano "${sub.planName}". Ele continua valendo${end ? ` até ${formatBr(end)}` : ''} e não haverá novas cobranças.`,
    })
    await whatsCancel(fs, sub, subId, {
      owner: `❌ *Plano cancelado pelo cliente*\n\n${sub.clientName} cancelou o plano *${sub.planName}*.` +
        (end ? ` Ele continua valendo até ${formatBr(end)}.` : '') +
        (sub.billingMode === CARD_MODE ? CARD_CANCEL_TIP : ''),
      retention: { validUntil: end ? formatBr(end) : undefined },
    })
    return { status: 'active' }
  }

  if (sub.status === 'pending' || sub.status === 'past_due') {
    await cancelOpenInvoice(fs, subId, (sub.openInvoice as { id?: string } | null)?.id)
    await cancelPendingUpgrade(fs, subId, sub.pendingUpgrade)
    await fs.update(doc.path, { status: 'canceled', canceledAt: new Date(), canceledBy: 'client', billingNextCheck: null })
    await notify(env, fs, {
      type: 'plan_canceled',
      targetRole: 'owner',
      relatedId: subId,
      title: 'Cliente cancelou o plano',
      message: `${sub.clientName} cancelou o plano "${sub.planName}"${sub.status === 'past_due' ? ' (estava em atraso)' : ''}.`,
    })
    await whatsCancel(fs, sub, subId, {
      owner:
        `❌ *Plano cancelado pelo cliente*\n\n${sub.clientName} cancelou o plano *${sub.planName}*` +
        (sub.status === 'past_due' ? ' (estava com mensalidade em atraso).' : '.') +
        (sub.billingMode === CARD_MODE ? CARD_CANCEL_TIP : ''),
      retention: {},
    })
    return { status: 'canceled' }
  }

  throw new ApiError('failed-precondition', 'Este plano já está encerrado.')
}

/** Cancela um upgrade que ficou esperando pagamento. */
async function cancelPendingUpgrade(fs: Ctx['fs'], subId: string, pending: unknown) {
  const p = pending as { invoiceId?: string } | null | undefined
  if (!p) return
  const writes = [fs.updateWrite(`subscriptions/${subId}`, { pendingUpgrade: null })]
  if (p.invoiceId) writes.unshift(fs.updateWrite(`invoices/${p.invoiceId}`, { status: 'canceled', canceledAt: new Date() }))
  await fs.commit(writes)
}

/**
 * Upgrade: cliente com plano em dia escolhe um plano mais caro e paga só a
 * diferença. Ao pagar, o plano muda na hora (créditos a mais já valem),
 * o vencimento continua o mesmo e a próxima mensalidade vem no valor novo.
 */
export async function upgradePlan({ env, fs, uid, data }: Ctx) {
  const planId = safeId(data.planId, 'Plano')
  const [plan, subs] = await Promise.all([
    fs.get(`plans/${planId}`),
    fs.query('subscriptions', {
      where: [
        { field: 'clientId', op: '==', value: uid },
        { field: 'status', op: '==', value: 'active' },
      ],
      limit: 1,
    }),
  ])
  if (!plan || plan.data.active !== true) throw new ApiError('not-found', 'Plano indisponível.')
  if (subs.length === 0) throw new ApiError('failed-precondition', 'Você precisa ter um plano ativo para fazer upgrade.')
  const subDoc = subs[0]
  const sub = subDoc.data

  if (sub.planId === planId) throw new ApiError('failed-precondition', 'Esse já é o seu plano.')
  if (sub.billingMode === CARD_MODE) {
    throw new ApiError('failed-precondition', 'Seu plano é cobrado no cartão recorrente. Para trocar de plano, fale com a barbearia.')
  }
  if (sub.cancelAtPeriodEnd) {
    throw new ApiError('failed-precondition', 'Seu plano está cancelado. Toque em "Quero manter meu plano" antes do upgrade.')
  }
  if (sub.openInvoice) {
    throw new ApiError('failed-precondition', 'Pague a mensalidade em aberto antes de fazer upgrade.')
  }
  const diff = Math.round((Number(plan.data.price) - Number(sub.planPrice)) * 100) / 100
  if (diff <= 0) throw new ApiError('failed-precondition', 'O upgrade só vale para um plano mais caro que o atual.')

  // Mesmo upgrade já iniciado: devolve o mesmo link.
  const pending = sub.pendingUpgrade as { planId?: string; checkoutUrl?: string } | null | undefined
  if (pending?.planId === planId && pending.checkoutUrl) return { checkoutUrl: pending.checkoutUrl, amount: diff }
  await cancelPendingUpgrade(fs, subDoc.id, pending)

  const now = new Date()
  const { checkoutUrl } = await createInvoice(env, fs, {
    subId: subDoc.id,
    sub,
    kind: 'upgrade',
    dueDate: now,
    periodStart: now,
    periodEnd: (sub.currentPeriodEnd as Date) ?? now,
    amount: Math.max(diff, 1),
    description: `Upgrade ${sub.planName} → ${String(plan.data.name).trim()}`,
    extra: { targetPlanId: planId, targetPlanName: String(plan.data.name).trim(), targetPlanPrice: plan.data.price },
  })
  return { checkoutUrl, amount: Math.max(diff, 1) }
}
