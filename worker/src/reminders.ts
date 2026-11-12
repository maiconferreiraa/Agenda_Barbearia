import type { Env } from './env'
import { Firestore } from './firestore'
import { budget } from './google'
import { DAY_MS, sp } from './time'
import { businessInfo, firstName, normalizePhoneBr } from './whatsapp'

/** Quantas horas antes do horário sai o lembrete (o cron roda das 9h às 20h50). */
const LEAD_MS = DAY_MS
/** Marcou com menos antecedência que isto: já recebeu a confirmação, não precisa de lembrete. */
const MIN_BOOKED_AHEAD_MS = 12 * 60 * 60 * 1000
/** Limite de chamadas externas por execução (plano grátis: 50; a cobrança usa até 36). */
const BUDGET_LIMIT = 46

function hhmm(date: Date) {
  const m = sp(date).minutes
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Lembrete ⏰ no WhatsApp para os horários das próximas 24 h (uma vez por horário).
 * Roda depois da régua de cobrança, no mesmo cron.
 */
export async function runAppointmentReminders(env: Env) {
  if (budget.used >= BUDGET_LIMIT - 3) return
  const fs = new Firestore(env)
  const now = new Date()
  const upcoming = await fs.query('appointments', {
    where: [
      { field: 'date', op: '>', value: now },
      { field: 'date', op: '<=', value: new Date(now.getTime() + LEAD_MS) },
    ],
    orderBy: { field: 'date' },
    limit: 30,
  })

  const todo = upcoming.filter((d) => {
    const a = d.data
    if (!['scheduled', 'confirmed'].includes(String(a.status)) || a.reminderSentAt) return false
    const created = a.createdAt as Date | undefined
    return !created || (a.date as Date).getTime() - created.getTime() >= MIN_BOOKED_AHEAD_MS
  })
  if (todo.length === 0) return

  const shop = await businessInfo(fs)
  const today = sp(now)
  for (const doc of todo) {
    if (budget.used >= BUDGET_LIMIT) break
    const a = doc.data
    const to = normalizePhoneBr(a.clientPhone)
    const when = a.date as Date
    const d = sp(when)
    const sameDay = d.year === today.year && d.month === today.month && d.day === today.day
    const writes = [fs.updateWrite(doc.path, { reminderSentAt: now })]
    if (to) {
      writes.push(
        fs.createWrite(`whatsappOutbox/${fs.newId()}`, {
          to,
          kind: 'appointment_reminder',
          relatedId: doc.id,
          status: 'pending',
          attempts: 0,
          createdAt: now,
          text:
            `⏰ Oi, ${firstName(a.clientName)}! Lembrete: *${sameDay ? 'hoje' : 'amanhã'} às ${hhmm(when)}* ` +
            `você tem *${a.serviceName}* na ${shop.name}.\n\n` +
            `Se não puder vir, avise com antecedência para liberarmos o horário. Até lá! 💈`,
        }),
      )
    }
    await fs.commit(writes)
  }
}
