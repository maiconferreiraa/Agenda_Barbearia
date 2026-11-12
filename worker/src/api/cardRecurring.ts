import { ApiError, type Env } from '../env'
import type { Data, Doc, Firestore } from '../firestore'
import { notify } from '../notify'
import { addMonths, brl, formatBr } from '../time'
import { businessInfo, firstName, queueWhatsapp } from '../whatsapp'
import type { Ctx } from './ctx'
import { requireOwner } from './ctx'

/**
 * Plano no CARTÃO RECORRENTE da InfinitePay: o dono cria no app da InfinitePay
 * um link de cobrança recorrente para o plano e cola no cadastro do plano.
 * O cliente põe o cartão uma vez e a InfinitePay cobra todo mês sozinha.
 *
 * Esse link não avisa o sistema (sem webhook), então:
 * - o dono CONFIRMA o 1º pagamento (vê no app da InfinitePay);
 * - todo mês, no vencimento, o sistema renova sozinho (créditos novos) e lança
 *   o pagamento no relatório;
 * - se a InfinitePay avisar que o cartão foi recusado, o dono toca em
 *   "Cartão recusado": o plano fica em atraso e o cliente recebe o aviso 🚨.
 */
export const CARD_MODE = 'card_recurring'
const SUBSCRIPTION_PAGE = '/app/subscription'
/** Dias com o cartão recusado até o plano vencer (mesmo prazo das mensalidades). */
const CARD_GRACE_DAYS = 10

/** Aceita só link https da InfinitePay. */
export function cleanRecurringLink(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:' || !/(^|\.)infinitepay\.io$/.test(u.hostname)) return null
    return u.toString()
  } catch {
    return null
  }
}

function safeSubId(v: unknown) {
  const id = String(v ?? '')
  if (!id || id.includes('/')) throw new ApiError('invalid-argument', 'Assinatura inválida.')
  return id
}

async function clientPhone(fs: Firestore, sub: Data) {
  return (await fs.get(`users/${sub.clientId}`))?.data.phone
}

/** Lança no relatório (coleção payments) uma cobrança do cartão recorrente. */
function paymentWrite(fs: Firestore, id: string, subId: string, sub: Data, when: Date, source: 'card_confirmed' | 'card_auto') {
  return fs.createWrite(`payments/${id}`, {
    subscriptionId: subId,
    clientId: sub.clientId,
    clientName: sub.clientName,
    planName: sub.planName,
    amount: Number(sub.planPrice) || 0,
    status: 'approved',
    kind: 'renewal',
    captureMethod: 'credit_card',
    source,
    paidAt: when,
    createdAt: when,
  })
}

/** POST /api/confirmCardPayment { subscriptionId } — dono viu o pagamento no app da InfinitePay. */
export async function confirmCardPayment(ctx: Ctx) {
  const { env, fs, data } = ctx
  await requireOwner(ctx)
  const subId = safeSubId(data.subscriptionId)
  const doc = await fs.get(`subscriptions/${subId}`)
  const sub = doc?.data
  if (!doc || !sub) throw new ApiError('not-found', 'Assinatura não encontrada.')
  if (sub.billingMode !== CARD_MODE) throw new ApiError('failed-precondition', 'Esse plano não é no cartão recorrente.')
  if (!['pending', 'past_due', 'expired'].includes(String(sub.status))) {
    throw new ApiError('failed-precondition', 'Essa assinatura já está em dia.')
  }

  const now = new Date()
  const end = sub.currentPeriodEnd as Date | undefined
  const update: Data = { status: 'active', cardRefusedAt: null, billingNextCheck: now }
  // 1º pagamento, ou plano que tinha vencido: mês novo a partir de hoje.
  if (sub.status !== 'past_due' || !end || end.getTime() < now.getTime()) {
    Object.assign(update, { currentPeriodStart: now, currentPeriodEnd: addMonths(now, 1), usage: {} })
  }
  const paymentId = fs.newId()
  const writes = [fs.updateWrite(doc.path, update)]
  // Atraso dentro do mês: a renovação automática já tinha lançado o pagamento (e foi marcada recusada).
  const refused = sub.lastAutoPaymentId as string | undefined
  if (sub.status === 'past_due' && refused) {
    writes.push(fs.updateWrite(`payments/${refused}`, { status: 'approved', paidAt: now }))
  } else {
    writes.push(paymentWrite(fs, paymentId, subId, sub, now, 'card_confirmed'))
  }
  await fs.commit(writes)

  const nextEnd = (update.currentPeriodEnd as Date | undefined) ?? end!
  await notify(env, fs, {
    type: 'payment_received',
    targetUserId: String(sub.clientId),
    relatedId: subId,
    link: SUBSCRIPTION_PAGE,
    title: 'Pagamento confirmado',
    message: `Seu plano "${sub.planName}" está ativo. Próxima cobrança no cartão: ${formatBr(nextEnd)}.`,
  })
  const shop = await businessInfo(fs)
  await queueWhatsapp(fs, {
    phone: await clientPhone(fs, sub),
    kind: 'card_confirmed',
    relatedId: subId,
    text:
      `✅ Pagamento confirmado, ${firstName(sub.clientName)}!\n\n` +
      `Seu plano *${sub.planName}* está ativo. A próxima cobrança cai sozinha no seu cartão em *${formatBr(nextEnd)}*.\n\n${shop.name}`,
  })
  return { ok: true }
}

/** POST /api/markCardRefused { subscriptionId } — a InfinitePay avisou que a cobrança do cartão não passou. */
export async function markCardRefused(ctx: Ctx) {
  const { env, fs, data } = ctx
  await requireOwner(ctx)
  const subId = safeSubId(data.subscriptionId)
  const doc = await fs.get(`subscriptions/${subId}`)
  const sub = doc?.data
  if (!doc || !sub) throw new ApiError('not-found', 'Assinatura não encontrada.')
  if (sub.billingMode !== CARD_MODE) throw new ApiError('failed-precondition', 'Esse plano não é no cartão recorrente.')
  if (sub.status !== 'active') throw new ApiError('failed-precondition', 'Só dá para marcar recusa num plano ativo.')

  const now = new Date()
  const writes = [fs.updateWrite(doc.path, { status: 'past_due', cardRefusedAt: now, billingNextCheck: now })]
  const lastAuto = sub.lastAutoPaymentId as string | undefined
  if (lastAuto) writes.push(fs.updateWrite(`payments/${lastAuto}`, { status: 'rejected' }))
  await fs.commit(writes)

  await notify(env, fs, {
    type: 'payment_overdue',
    targetUserId: String(sub.clientId),
    relatedId: subId,
    link: SUBSCRIPTION_PAGE,
    title: '🚨 Cartão recusado',
    message: `A cobrança do plano "${sub.planName}" não passou no cartão. Atualize o cartão para não perder os benefícios.`,
  })
  const shop = await businessInfo(fs)
  const link = sub.recurringLink as string | undefined
  await queueWhatsapp(fs, {
    phone: await clientPhone(fs, sub),
    kind: 'card_refused',
    relatedId: subId,
    text:
      `🚨 *COBRANÇA RECUSADA NO CARTÃO* 🚨\n\n` +
      `Olá, ${firstName(sub.clientName)}. A mensalidade do plano *${sub.planName}* (${brl(sub.planPrice)}) não passou no seu cartão.\n\n` +
      `Os benefícios ficam pausados até o pagamento.` +
      (link ? ` Cadastre o cartão de novo por este link:\n${link}` : ' Fale com a barbearia para regularizar.') +
      `\n\n${shop.name}`,
  })
  return { ok: true }
}

/**
 * Régua diária para planos no cartão recorrente (chamada por scheduled.ts depois
 * de tratar pendente e cancelamento). Devolve true quando não precisa mais olhar.
 */
export async function processCardSubscription(env: Env, fs: Firestore, doc: Doc, now: Date): Promise<boolean> {
  const sub = doc.data
  const end = sub.currentPeriodEnd as Date | undefined
  if (!end) return false

  if (sub.status === 'active') {
    if (end.getTime() > now.getTime()) {
      // Véspera: avisa que a mensalidade cai no cartão (uma vez por vencimento).
      const reminded = sub.cardReminderFor as Date | undefined
      if (end.getTime() - now.getTime() <= 86400000 && reminded?.getTime() !== end.getTime() && !sub.cancelAtPeriodEnd) {
        await fs.update(doc.path, { cardReminderFor: end })
        const shop = await businessInfo(fs)
        await queueWhatsapp(fs, {
          phone: await clientPhone(fs, sub),
          kind: 'card_due_soon',
          relatedId: doc.id,
          text:
            `⏰ Oi, ${firstName(sub.clientName)}! Lembrete: a mensalidade do plano *${sub.planName}* ` +
            `(${brl(sub.planPrice)}) vai ser cobrada no seu cartão em *${formatBr(end)}*.\n\n` +
            `Deixe o limite disponível pra não pausar os benefícios. ${shop.name}`,
        })
      }
      return false
    }
    // Venceu: a InfinitePay cobra o cartão sozinha → mês novo, créditos novos.
    const paymentId = fs.newId()
    const newEnd = addMonths(end, 1)
    await fs.commit([
      fs.updateWrite(doc.path, {
        currentPeriodStart: end,
        currentPeriodEnd: newEnd,
        usage: {},
        lastAutoPaymentId: paymentId,
        lastAutoRenewAt: now,
      }),
      paymentWrite(fs, paymentId, doc.id, sub, now, 'card_auto'),
    ])
    await notify(env, fs, {
      type: 'payment_received',
      targetRole: 'owner',
      relatedId: doc.id,
      title: '💳 Plano renovado no cartão',
      message:
        `${sub.clientName} — ${sub.planName} (${brl(sub.planPrice)}) renovou hoje. Confira no app da InfinitePay; ` +
        `se a cobrança não passou, abra Assinaturas e toque em "Cartão recusado".`,
    })
    return false
  }

  if (sub.status === 'past_due') {
    const refusedAt = sub.cardRefusedAt as Date | undefined
    if (refusedAt && now.getTime() - refusedAt.getTime() >= CARD_GRACE_DAYS * 86400000) {
      await fs.update(doc.path, { status: 'expired' })
      await notify(env, fs, {
        type: 'plan_expired',
        targetRole: 'owner',
        relatedId: doc.id,
        title: 'Plano vencido (cartão recusado)',
        message: `${sub.clientName} está há ${CARD_GRACE_DAYS} dias com o cartão recusado (${sub.planName}). O plano foi marcado como vencido.`,
      })
      const shop = await businessInfo(fs)
      const link = sub.recurringLink as string | undefined
      await queueWhatsapp(fs, {
        phone: await clientPhone(fs, sub),
        kind: 'plan_expired',
        relatedId: doc.id,
        text:
          `🚨 *PLANO VENCIDO* 🚨\n\n` +
          `Olá, ${firstName(sub.clientName)}. Seu plano *${sub.planName}* venceu porque a cobrança no cartão não passou.` +
          (link ? `\n\nPara voltar, cadastre o cartão por este link:\n${link}` : '') +
          `\n\n${shop.name}`,
      })
      return true
    }
  }
  return false
}
