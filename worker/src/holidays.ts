import type { Env } from './env'
import { Firestore } from './firestore'
import { budget } from './google'
import { notify } from './notify'
import { DAY_MS, formatBr, sp, spDate } from './time'
import { nationalHolidays } from './holidayCalendar'
import { businessInfo, firstName, normalizePhoneBr } from './whatsapp'

/**
 * Feriados / dias fechados (`holidays/{AAAA-MM-DD}`, criados pelo dono na tela
 * Feriados). No `notifyAt`, avisa no WhatsApp todos os clientes cadastrados que
 * a barbearia vai fechar, para marcarem antes. Uma vez por feriado.
 *
 * Vai como prioridade baixa: a ponte manda primeiro os avisos de pagamento e
 * horário e espalha o resto pelos dias seguintes (limite diário do WhatsApp).
 */
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** Quantos dias antes o aviso sai quando o dono não escolheu. */
export const DEFAULT_NOTIFY_DAYS = 5
/** Os feriados "fechar todo ano" são criados com esta antecedência. */
const RECURRING_LEAD_DAYS = 45

/** Grava o fechamento (feriado + bloqueio do dia inteiro na agenda). Mesmo formato que o app grava. */
function closureWrites(fs: Firestore, ymd: string, name: string, key: string | null, notifyDays: number) {
  const [y, m, d] = ymd.split('-').map(Number)
  return [
    fs.createWrite(`holidays/${ymd}`, {
      date: spDate(y, m - 1, d, 12 * 60),
      name,
      key,
      closed: true,
      notify: true,
      notifyDaysBefore: notifyDays,
      notifyAt: spDate(y, m - 1, d - notifyDays, 10 * 60),
      auto: true,
      createdAt: new Date(),
    }),
    fs.setWrite(`agendaBlocks/holiday-${ymd}`, {
      date: spDate(y, m - 1, d, 0),
      durationMinutes: 24 * 60,
      reason: `Feriado: ${name}`,
      createdAt: new Date(),
    }),
  ]
}

/** "Fechar todo ano": cria o fechamento dos próximos feriados escolhidos pelo dono. */
async function ensureRecurringClosures(fs: Firestore, now: Date) {
  const prefs = (await fs.get('ownerSettings/feriados'))?.data
  const keys = new Set((prefs?.alwaysClosed as string[] | undefined) ?? [])
  if (keys.size === 0) return
  const notifyDays = Number(prefs?.notifyDaysBefore) || DEFAULT_NOTIFY_DAYS
  const today = sp(now)
  const todayYmd = `${today.year}-${String(today.month + 1).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`
  const limit = new Date(now.getTime() + RECURRING_LEAD_DAYS * DAY_MS)
  const l = sp(limit)
  const limitYmd = `${l.year}-${String(l.month + 1).padStart(2, '0')}-${String(l.day).padStart(2, '0')}`
  const upcoming = [...nationalHolidays(today.year), ...nationalHolidays(today.year + 1)].filter(
    (h) => keys.has(h.key) && h.ymd > todayYmd && h.ymd <= limitYmd,
  )
  for (const h of upcoming) {
    if (budget.used >= 40) return
    const existing = await fs.get(`holidays/${h.ymd}`)
    // já existe (fechado, ou o dono reabriu este ano): respeita
    if (existing) continue
    await fs.commit(closureWrites(fs, h.ymd, h.name, h.key, notifyDays))
  }
}

export async function runHolidayNotices(env: Env) {
  if (budget.used >= 44) return
  const fs = new Firestore(env)
  const now = new Date()
  await ensureRecurringClosures(fs, now)
  const due = await fs.query('holidays', { where: [{ field: 'notifyAt', op: '<=', value: now }], limit: 5 })
  const todo = due.filter((d) => d.data.closed === true && d.data.notify !== false && !d.data.notifiedAt)
  if (todo.length === 0) return

  const [shop, clients] = await Promise.all([
    businessInfo(fs),
    fs.query('users', { where: [{ field: 'role', op: '==', value: 'client' }] }),
  ])
  // um aviso por telefone (o mesmo número pode ter duas fichas)
  const people = new Map<string, string>()
  for (const c of clients) {
    const to = normalizePhoneBr(c.data.phone)
    if (to && !people.has(to)) people.set(to, String(c.data.name ?? ''))
  }

  for (const h of todo) {
    if (budget.used >= 46) break
    const date = h.data.date as Date
    if (date.getTime() < now.getTime() - DAY_MS) {
      await fs.update(h.path, { notifiedAt: now, notifiedCount: 0, skipped: 'já passou' })
      continue
    }
    const name = String(h.data.name ?? 'Feriado')
    const day = `${formatBr(date).slice(0, 5)} (${WEEKDAYS[new Date(date.getTime() - 3 * 3600e3).getUTCDay()]})`
    const validUntil = date // depois do feriado não faz sentido mandar
    const writes = [...people.entries()].map(([to, client]) =>
      fs.createWrite(`whatsappOutbox/${fs.newId()}`, {
        to,
        kind: 'holiday_notice',
        relatedId: h.id,
        priority: 'low',
        validUntil,
        status: 'pending',
        attempts: 0,
        createdAt: now,
        text:
          `📅 Oi, ${firstName(client)}! Aviso da ${shop.name}:\n\n` +
          `No dia *${day}* — ${name} — vamos estar *fechados*.\n\n` +
          `Quer cortar antes? Garanta seu horário agora, sem deixar pra última hora:\n${env.APP_BASE_URL}\n\nAté lá! 💈`,
      }),
    )
    // grava em lotes (1 chamada por lote) e marca o feriado como avisado
    for (let i = 0; i < writes.length; i += 400) await fs.commit(writes.slice(i, i + 400))
    await fs.update(h.path, { notifiedAt: now, notifiedCount: writes.length })
    await notify(env, fs, {
      type: 'invoice_created',
      targetRole: 'owner',
      relatedId: h.id,
      title: '📅 Aviso de feriado enviado',
      message: `O aviso de ${name} (${day}) entrou na fila para ${writes.length} cliente(s). O WhatsApp manda aos poucos, sem atrapalhar os avisos de pagamento.`,
    })
  }
}
