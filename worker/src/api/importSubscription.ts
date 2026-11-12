import { ApiError } from '../env'
import type { Data } from '../firestore'
import { createInvoice } from '../billing'
import { savedHandle } from '../infinitepay'
import { notify } from '../notify'
import { addMonths, brl, formatBr, spDate } from '../time'
import { PHONE_RULE, businessInfo, firstName, queueWhatsapp, strictPhoneBr } from '../whatsapp'
import { CARD_MODE, cleanRecurringLink } from './cardRecurring'
import type { Ctx } from './ctx'
import { requireOwner } from './ctx'

/** "2026-11-15" → 15/11 às 23:59 (Brasília): o cliente pode pagar até o fim do dia. */
function parseDueDate(raw: unknown): Date {
  const m = typeof raw === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) : null
  if (!m) throw new ApiError('invalid-argument', 'Informe a data de vencimento.')
  const date = spDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23 * 60 + 59)
  if (Number.isNaN(date.getTime())) throw new ApiError('invalid-argument', 'Data de vencimento inválida.')
  return date
}

/**
 * POST /api/importSubscription — dono passa um assinante do sistema antigo pro novo.
 * { name, phone, planId, dueDate: 'AAAA-MM-DD', paid, usage: { serviceId: usados }, welcome }
 *
 * - paid = true: a mensalidade atual já foi paga; `dueDate` é o PRÓXIMO vencimento.
 *   A régua gera o link 5 dias antes, como para qualquer assinante.
 * - paid = false: a mensalidade de `dueDate` está em aberto; o link é gerado agora
 *   (e, se a data já passou, a régua manda o aviso de atraso na próxima rodada).
 *
 * O cliente não precisa ter conta no app: as mensagens e os links vão pelo WhatsApp.
 */
export async function importSubscription(ctx: Ctx) {
  const { env, fs, data } = ctx
  await requireOwner(ctx)

  const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ').slice(0, 80) : ''
  if (name.length < 2) throw new ApiError('invalid-argument', 'Digite o nome do cliente.')
  const phone = strictPhoneBr(data.phone)
  if (!phone) throw new ApiError('invalid-argument', PHONE_RULE)
  const planId = typeof data.planId === 'string' && data.planId && !data.planId.includes('/') ? data.planId : ''
  if (!planId) throw new ApiError('invalid-argument', 'Escolha o plano.')
  const plan = await fs.get(`plans/${planId}`)
  if (!plan) throw new ApiError('not-found', 'Plano não encontrado.')
  // card = já paga no cartão recorrente da InfinitePay (o sistema só acompanha)
  const card = data.paid === 'card'
  const paid = data.paid === true || card
  const due = parseDueDate(data.dueDate)
  const now = new Date()

  if (card && due.getTime() < now.getTime()) {
    throw new ApiError('invalid-argument', 'No cartão recorrente, informe a data da PRÓXIMA cobrança (uma data futura).')
  }
  if (paid && due.getTime() < now.getTime()) {
    throw new ApiError('invalid-argument', 'Se a mensalidade já foi paga, informe o PRÓXIMO vencimento (uma data futura).')
  }
  if (!paid && !(await savedHandle(fs))) {
    throw new ApiError('failed-precondition', 'Conecte a InfinitePay em Configurações antes, pra gerar o link de pagamento.')
  }

  // Créditos já usados no mês, só dos serviços que o plano inclui (até o limite).
  const included = (plan.data.includedServices as { serviceId: string; quantity: number }[] | undefined) ?? []
  const rawUsage = (data.usage ?? {}) as Record<string, unknown>
  const usage: Record<string, number> = {}
  for (const item of included) {
    const n = Math.floor(Number(rawUsage[item.serviceId] ?? 0))
    if (n > 0) usage[item.serviceId] = Math.min(n, item.quantity)
  }

  // Cliente: reaproveita quem já tem esse telefone; senão cria só a ficha (sem login).
  const samePhone = await fs.query('users', { where: [{ field: 'phone', op: '==', value: phone }], limit: 1 })
  let clientId: string
  let clientName = name
  let createdUser = false
  if (samePhone.length > 0) {
    if (samePhone[0].data.role !== 'client') {
      throw new ApiError('failed-precondition', 'Esse telefone é de uma conta da barbearia, não de cliente.')
    }
    clientId = samePhone[0].id
    clientName = String(samePhone[0].data.name ?? name)
    const busy = await fs.query('subscriptions', {
      where: [
        { field: 'clientId', op: '==', value: clientId },
        { field: 'status', op: 'in', value: ['active', 'pending', 'past_due'] },
      ],
      limit: 1,
    })
    if (busy.length > 0) {
      throw new ApiError('already-exists', `${clientName} já tem um plano no sistema novo (${busy[0].data.planName}).`)
    }
  } else {
    clientId = fs.newId()
    createdUser = true
    await fs.create(`users/${clientId}`, {
      name,
      phone,
      email: null,
      role: 'client',
      birthday: normalizeBirthday(data.birthday) ?? null,
      imported: true,
      hasAccount: false,
      createdAt: now,
    })
  }

  const subId = fs.newId()
  const sub: Data = {
    clientId,
    clientName,
    planId,
    planName: String(plan.data.name).trim(),
    planPrice: plan.data.price,
  }
  await fs.create(`subscriptions/${subId}`, {
    ...sub,
    status: 'active',
    usage,
    // nunca no futuro: senão o que for marcado antes disso não devolve crédito ao desmarcar
    currentPeriodStart: new Date(Math.min(addMonths(due, -1).getTime(), now.getTime())),
    currentPeriodEnd: due,
    // créditos novos no dia do vencimento, quando a mensalidade for paga
    creditsResetAt: card ? null : due,
    openInvoice: null,
    imported: true,
    importedPaid: paid,
    ...(card ? { billingMode: CARD_MODE, recurringLink: cleanRecurringLink(plan.data.recurringLink) } : {}),
    billingNextCheck: now,
    createdAt: now,
  })

  let checkoutUrl: string | null = null
  if (!paid) {
    try {
      checkoutUrl = (
        await createInvoice(env, fs, {
          subId,
          sub,
          kind: 'renewal',
          dueDate: due,
          periodStart: due,
          periodEnd: addMonths(due, 1),
        })
      ).checkoutUrl
    } catch (err) {
      console.error('Importação: falha ao gerar o link', String(err))
      await fs.commit([
        fs.updateWrite(`subscriptions/${subId}`, { status: 'canceled', billingNextCheck: null, error: String(err) }),
      ])
      if (createdUser) await fs.update(`users/${clientId}`, { importFailed: true })
      throw new ApiError('internal', 'A InfinitePay não gerou o link de pagamento. Confira a conexão em Configurações e tente de novo.')
    }
  }

  let welcomeQueued = false
  if (data.welcome !== false) {
    const shop = await businessInfo(fs)
    welcomeQueued = await queueWhatsapp(fs, {
      phone,
      kind: 'import_welcome',
      relatedId: subId,
      text:
        `Olá, ${firstName(clientName)}! 💈\n\n` +
        `A ${shop.name} agora tem um sistema novo de planos, e o seu plano *${String(plan.data.name).trim()}* ` +
        `(${brl(plan.data.price)}/mês) já está cadastrado nele.\n\n` +
        (card
          ? `✅ Sua mensalidade está em dia. A próxima cobrança cai sozinha no seu cartão em *${formatBr(due)}*.`
          : paid
          ? `✅ Sua mensalidade está em dia. Próximo vencimento: *${formatBr(due)}*.\n` +
            `Uns dias antes, o link de pagamento (Pix ou cartão) chega aqui no WhatsApp.`
          : `Sua mensalidade de *${formatBr(due)}* (${brl(plan.data.price)}) está em aberto. ` +
            `Pague por Pix ou cartão neste link:\n${checkoutUrl}`) +
        `\n\nOs avisos de mensalidade vão chegar por este número. Qualquer dúvida, é só responder aqui.`,
    })
  }

  await notify(env, fs, {
    type: 'plan_chosen',
    targetRole: 'owner',
    relatedId: subId,
    title: 'Assinante importado',
    message: `${clientName} — ${String(plan.data.name).trim()}, ${paid ? `em dia, próximo vencimento ${formatBr(due)}` : `mensalidade de ${formatBr(due)} em aberto`}.`,
  })

  return { subscriptionId: subId, clientId, checkoutUrl, welcomeQueued, reusedClient: !createdUser }
}

/** "15/03", "1503" ou "03-15" → "03-15" (mês-dia). Vazio = sem aniversário. */
export function normalizeBirthday(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null || raw === '') return null
  const s = String(raw).trim()
  let m = /^(\d{2})-(\d{2})$/.exec(s)
  const [mm, dd] = m ? [Number(m[1]), Number(m[2])] : (() => {
    m = /^(\d{1,2})\/(\d{1,2})$/.exec(s)
    return m ? [Number(m[2]), Number(m[1])] : [0, 0]
  })()
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) throw new ApiError('invalid-argument', 'Aniversário inválido (dia/mês).')
  return `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

/** POST /api/updateClientPhone { clientId, phone, birthday? } — dono corrige telefone/aniversário de um cliente. */
export async function updateClientPhone(ctx: Ctx) {
  const { fs, data } = ctx
  await requireOwner(ctx)
  const clientId = typeof data.clientId === 'string' && data.clientId && !data.clientId.includes('/') ? data.clientId : ''
  if (!clientId) throw new ApiError('invalid-argument', 'Cliente inválido.')
  const phone = strictPhoneBr(data.phone)
  if (!phone) throw new ApiError('invalid-argument', PHONE_RULE)
  const user = await fs.get(`users/${clientId}`)
  if (!user || user.data.role !== 'client') throw new ApiError('not-found', 'Cliente não encontrado.')
  const other = await fs.query('users', { where: [{ field: 'phone', op: '==', value: phone }], limit: 2 })
  if (other.some((u) => u.id !== clientId)) throw new ApiError('already-exists', 'Esse telefone já é de outro cliente.')
  const birthday = normalizeBirthday(data.birthday)
  await fs.update(`users/${clientId}`, { phone, ...(birthday !== undefined ? { birthday } : {}) })
  return { phone, birthday: birthday ?? null }
}
