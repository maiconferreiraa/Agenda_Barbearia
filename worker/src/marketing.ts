import type { Env } from './env'
import { Firestore } from './firestore'
import { budget } from './google'
import { DAY_MS, sp } from './time'
import { businessInfo, firstName, normalizePhoneBr } from './whatsapp'

/**
 * Mensagens automáticas para trazer cliente de volta (Configurações → Marketing):
 * - Cliente sumido: último atendimento há N dias (padrão 30) e nada marcado →
 *   "Sentimos sua falta", uma vez por ausência (winback/{telefone}).
 * - Aniversário: no dia (users.birthday = "MM-DD"), uma vez por ano.
 * Rodam só entre 10h e 11h (Brasília), com prioridade baixa na ponte.
 */
const RUN_HOUR = 10
const LOOKBACK_DAYS = 120
const MAX_PER_RUN = 15

interface MarketingSettings {
  winback?: { enabled?: boolean; days?: number; offer?: string }
  birthday?: { enabled?: boolean; gift?: string }
}

function outbox(fs: Firestore, to: string, kind: string, relatedId: string, text: string, now: Date) {
  return fs.createWrite(`whatsappOutbox/${fs.newId()}`, {
    to,
    kind,
    relatedId,
    priority: 'low',
    validUntil: new Date(now.getTime() + DAY_MS),
    status: 'pending',
    attempts: 0,
    createdAt: now,
    text,
  })
}

export async function runMarketing(env: Env) {
  const now = new Date()
  if (sp(now).minutes < RUN_HOUR * 60 || sp(now).minutes >= (RUN_HOUR + 1) * 60) return
  if (budget.used >= 40) return
  const fs = new Firestore(env)
  const settings = ((await fs.get('businessSettings/main'))?.data ?? {}) as MarketingSettings
  const shop = await businessInfo(fs)
  // Ligados por padrão; o dono desliga em Configurações.
  if (settings.birthday?.enabled !== false) await birthdays(env, fs, shop.name, settings.birthday?.gift ?? '', now)
  if (settings.winback?.enabled !== false) {
    await winback(env, fs, shop.name, Number(settings.winback?.days) || 30, settings.winback?.offer ?? '', now)
  }
}

async function birthdays(env: Env, fs: Firestore, shopName: string, gift: string, now: Date) {
  const p = sp(now)
  const mmdd = `${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  const people = await fs.query('users', { where: [{ field: 'birthday', op: '==', value: mmdd }], limit: 50 })
  const writes = []
  for (const u of people) {
    if (u.data.role !== 'client' || u.data.birthdaySentYear === p.year) continue
    const to = normalizePhoneBr(u.data.phone)
    if (!to) continue
    writes.push(
      outbox(
        fs,
        to,
        'birthday',
        u.id,
        `🎉 Feliz aniversário, ${firstName(u.data.name)}!\n\n` +
          `A ${shopName} te deseja um dia incrível. ` +
          (gift.trim() ? `🎁 Seu presente: *${gift.trim()}*.` : 'Passa aqui pra comemorar no estilo!') +
          `\n\nMarque seu horário: ${env.APP_BASE_URL} 💈`,
        now,
      ),
      fs.updateWrite(u.path, { birthdaySentYear: p.year }),
    )
  }
  if (writes.length) await fs.commit(writes)
}

async function winback(env: Env, fs: Firestore, shopName: string, days: number, offer: string, now: Date) {
  // últimos atendimentos e horários futuros por telefone
  const recent = await fs.query('appointments', {
    where: [{ field: 'date', op: '>=', value: new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS) }],
    limit: 2000,
  })
  const last = new Map<string, { date: Date; name: string }>()
  const future = new Set<string>()
  for (const a of recent) {
    const to = normalizePhoneBr(a.data.clientPhone)
    if (!to) continue
    const date = a.data.date as Date
    if (date.getTime() > now.getTime() && ['scheduled', 'confirmed'].includes(String(a.data.status))) future.add(to)
    if (a.data.status !== 'done') continue
    const prev = last.get(to)
    if (!prev || prev.date < date) last.set(to, { date, name: String(a.data.clientName ?? '') })
  }
  const limit = now.getTime() - days * DAY_MS
  const due = [...last.entries()].filter(([to, v]) => v.date.getTime() <= limit && !future.has(to))
  const writes = []
  let sent = 0
  for (const [to, v] of due) {
    if (sent >= MAX_PER_RUN || budget.used >= 46) break
    const mark = await fs.get(`winback/${to}`)
    // já chamamos depois da última visita: não insiste
    if (mark && (mark.data.sentAt as Date).getTime() >= v.date.getTime()) continue
    writes.push(
      outbox(
        fs,
        to,
        'winback',
        to,
        `💈 Oi, ${firstName(v.name)}! Sentimos sua falta aqui na ${shopName}.\n\n` +
          `Já faz um tempinho desde o seu último corte — que tal dar aquele trato?` +
          (offer.trim() ? `\n🎁 ${offer.trim()}` : '') +
          `\n\nMarque seu horário: ${env.APP_BASE_URL}`,
        now,
      ),
      fs.setWrite(`winback/${to}`, { sentAt: now, lastVisit: v.date }),
    )
    sent++
  }
  if (writes.length) await fs.commit(writes)
}
