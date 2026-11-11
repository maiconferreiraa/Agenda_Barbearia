import { ApiError } from '../env'
import type { Ctx } from './ctx'
import { requireOwner } from './ctx'
import type { Data, Firestore } from '../firestore'
import { notify } from '../notify'
import { DAY_MS, formatDateTimeBr, sp, spDate, spDayStart } from '../time'

/** Antecedência mínima para o cliente desmarcar sozinho (mesmo valor no app). */
export const CLIENT_CANCEL_MIN_HOURS = 2

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

interface DayHours {
  enabled: boolean
  open: string
  close: string
}

/** Mesmo padrão do app (app/src/lib/schedule.ts) — vale enquanto o dono não salvar Configurações. */
const DEFAULT_SETTINGS: Data = {
  slotDurationMinutes: 30,
  hours: {
    mon: { enabled: true, open: '09:00', close: '19:00' },
    tue: { enabled: true, open: '09:00', close: '19:00' },
    wed: { enabled: true, open: '09:00', close: '19:00' },
    thu: { enabled: true, open: '09:00', close: '19:00' },
    fri: { enabled: true, open: '09:00', close: '19:00' },
    sat: { enabled: true, open: '09:00', close: '17:00' },
    sun: { enabled: false, open: '09:00', close: '13:00' },
  },
}

function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Minutos de início possíveis no dia (horário de Brasília), sem descontar ocupação. */
function candidateStarts(day: Date, duration: number, settings: Data): number[] {
  const p = sp(day)
  const hours = (settings.hours as Record<string, DayHours> | undefined)?.[WEEKDAY_KEYS[p.weekday]]
  if (!hours?.enabled) return []
  const step = Number(settings.slotDurationMinutes) || 30
  const open = toMinutes(hours.open)
  const close = toMinutes(hours.close)

  const now = sp(new Date())
  const isToday = now.year === p.year && now.month === p.month && now.day === p.day
  const out: number[] = []
  for (let start = open; start + duration <= close; start += step) {
    if (isToday && start <= now.minutes) continue
    out.push(start)
  }
  return out
}

async function loadServices(fs: Firestore, serviceIds: unknown) {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    throw new ApiError('invalid-argument', 'Escolha pelo menos um serviço.')
  }
  const ids = Array.from(new Set(serviceIds.map(String))).slice(0, 10)
  const docs = await Promise.all(ids.map((id) => fs.get(`services/${id}`)))
  return docs.map((d, i) => {
    if (!d || d.data.active !== true) throw new ApiError('not-found', 'Serviço indisponível.')
    return {
      id: ids[i],
      name: String(d.data.name),
      durationMinutes: Number(d.data.durationMinutes),
      price: Number(d.data.price),
    }
  })
}

function busyRanges(docs: { data: Data }[]) {
  return docs
    .map((d) => d.data)
    .filter((a) => a.status !== 'canceled')
    .map((a) => {
      const start = sp(a.date as Date).minutes
      return { start, end: start + Number(a.durationMinutes) }
    })
}

function dayRange(date: Date) {
  const start = spDayStart(date)
  return [
    { field: 'date', op: '>=' as const, value: start },
    { field: 'date', op: '<' as const, value: new Date(start.getTime() + DAY_MS) },
  ]
}

export async function getAvailableSlots({ fs, data }: Ctx) {
  const services = await loadServices(fs, data.serviceIds)
  const day = new Date(String(data.dateISO))
  if (Number.isNaN(day.getTime())) throw new ApiError('invalid-argument', 'Data inválida.')
  const duration = services.reduce((s, x) => s + x.durationMinutes, 0)

  const saved = (await fs.get('businessSettings/main'))?.data
  const settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
  const candidates = candidateStarts(day, duration, settings)
  if (candidates.length === 0) return { slots: [] }

  const busy = busyRanges(await fs.query('appointments', { where: dayRange(day) }))
  const p = sp(day)
  const slots = candidates
    .filter((start) => !busy.some((b) => start < b.end && start + duration > b.start))
    .map((start) => spDate(p.year, p.month, p.day, start).toISOString())
  return { slots }
}

export async function bookAppointment({ env, fs, uid, data }: Ctx) {
  const date = new Date(String(data.dateISO))
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() - 60_000) {
    throw new ApiError('invalid-argument', 'Horário inválido.')
  }
  const [user, services] = await Promise.all([fs.get(`users/${uid}`), loadServices(fs, data.serviceIds)])
  if (!user) throw new ApiError('not-found', 'Usuário não encontrado.')
  const totalDuration = services.reduce((s, x) => s + x.durationMinutes, 0)
  const appointmentId = fs.newId()

  const result = await fs.runTransaction(async (tx) => {
    const dayDocs = await tx.query('appointments', { where: dayRange(date) })
    const start = sp(date).minutes
    const end = start + totalDuration
    if (busyRanges(dayDocs).some((b) => start < b.end && end > b.start)) {
      throw new ApiError('already-exists', 'Esse horário acabou de ser ocupado. Escolha outro.')
    }

    const subs = await tx.query('subscriptions', {
      where: [
        { field: 'clientId', op: '==', value: uid },
        { field: 'status', op: '==', value: 'active' },
      ],
      limit: 1,
    })
    let subscriptionId: string | null = null
    let included: { serviceId: string; quantity: number }[] = []
    let usage: Record<string, number> = {}
    if (subs.length > 0) {
      subscriptionId = subs[0].id
      usage = (subs[0].data.usage as Record<string, number>) ?? {}
      const plan = await tx.get(`plans/${subs[0].data.planId}`)
      included = (plan?.data.includedServices as typeof included) ?? []
    }

    const usageUpdates: Data = {}
    const lines = services.map((s) => {
      const rule = included.find((i) => i.serviceId === s.id)
      const used = usage[s.id] ?? 0
      const usedPlanCredit = !!rule && used < rule.quantity
      if (usedPlanCredit) usageUpdates[`usage.${s.id}`] = used + 1
      return { serviceId: s.id, serviceName: s.name, durationMinutes: s.durationMinutes, price: s.price, usedPlanCredit }
    })
    if (subscriptionId && Object.keys(usageUpdates).length > 0) {
      tx.update(`subscriptions/${subscriptionId}`, usageUpdates)
    }

    const usedPlanCredit = lines.some((l) => l.usedPlanCredit)
    const appointment = {
      clientId: uid,
      clientName: user.data.name,
      clientPhone: user.data.phone ?? null,
      services: lines,
      serviceName: lines.map((l) => l.serviceName).join(' + '),
      durationMinutes: totalDuration,
      price: lines.filter((l) => !l.usedPlanCredit).reduce((s, l) => s + l.price, 0),
      subscriptionId,
      usedPlanCredit,
      date,
      status: 'scheduled',
      createdAt: new Date(),
    }
    tx.create(`appointments/${appointmentId}`, appointment)
    return appointment
  })

  await notify(env, fs, {
    type: 'appointment_new',
    targetRole: 'owner',
    relatedId: appointmentId,
    title: 'Novo agendamento',
    message: `${result.clientName} agendou ${result.serviceName} em ${formatDateTimeBr(date)}.`,
  })
  return { appointmentId, usedPlanCredit: result.usedPlanCredit }
}

/**
 * Horário cancelado → devolve os créditos do plano que ele usou, se o crédito
 * é do mês atual do plano. `creditRefunded` evita devolver duas vezes.
 */
async function cancelWithRefund(fs: Firestore, appointmentId: string, extra: Data) {
  return fs.runTransaction(async (tx) => {
    const appt = await tx.get(`appointments/${appointmentId}`)
    if (!appt) throw new ApiError('not-found', 'Horário não encontrado.')
    const a = appt.data
    if (a.status === 'canceled') return { appt: a, creditReturned: false }

    let creditReturned = false
    if (a.usedPlanCredit && a.subscriptionId && !a.creditRefunded) {
      const sub = await tx.get(`subscriptions/${a.subscriptionId}`)
      const periodStart = sub?.data.currentPeriodStart as Date | undefined
      const bookedAt = a.createdAt as Date | undefined
      if (sub && periodStart && bookedAt && bookedAt.getTime() >= periodStart.getTime()) {
        const usage = (sub.data.usage as Record<string, number>) ?? {}
        const updates: Data = {}
        for (const line of (a.services as { serviceId: string; usedPlanCredit: boolean }[]) ?? []) {
          if (!line.usedPlanCredit) continue
          const key = `usage.${line.serviceId}`
          const current = (updates[key] as number | undefined) ?? usage[line.serviceId] ?? 0
          updates[key] = Math.max(0, current - 1)
        }
        if (Object.keys(updates).length > 0) {
          tx.update(sub.path, updates)
          creditReturned = true
        }
      }
    }
    tx.update(appt.path, { status: 'canceled', canceledAt: new Date(), creditRefunded: creditReturned, ...extra })
    return { appt: a, creditReturned }
  })
}

export async function cancelMyAppointment({ env, fs, uid, data }: Ctx) {
  const id = String(data.appointmentId ?? '')
  if (!id || id.includes('/')) throw new ApiError('invalid-argument', 'Horário inválido.')
  const doc = await fs.get(`appointments/${id}`)
  const a = doc?.data
  if (!a || a.clientId !== uid) throw new ApiError('not-found', 'Horário não encontrado.')
  if (a.status !== 'scheduled' && a.status !== 'confirmed') {
    throw new ApiError('failed-precondition', 'Esse horário não pode mais ser desmarcado.')
  }
  const when = a.date as Date
  if (when.getTime() - Date.now() < CLIENT_CANCEL_MIN_HOURS * 60 * 60 * 1000) {
    throw new ApiError(
      'failed-precondition',
      `Só dá pra desmarcar pelo app até ${CLIENT_CANCEL_MIN_HOURS} h antes. Fale com a barbearia.`,
    )
  }

  const { creditReturned } = await cancelWithRefund(fs, id, { canceledBy: 'client' })
  await notify(env, fs, {
    type: 'appointment_canceled',
    targetRole: 'owner',
    relatedId: id,
    title: 'Horário desmarcado',
    message: `${a.clientName} desmarcou ${a.serviceName} de ${formatDateTimeBr(when)}.`,
  })
  return { ok: true, creditReturned }
}

/** Dono muda o status pela agenda (confirmar, concluir, faltou, cancelar). */
export async function setAppointmentStatus(ctx: Ctx) {
  const { env, fs, data } = ctx
  await requireOwner(ctx)
  const id = String(data.appointmentId ?? '')
  const status = String(data.status ?? '')
  if (!id || id.includes('/')) throw new ApiError('invalid-argument', 'Horário inválido.')
  if (!['scheduled', 'confirmed', 'done', 'canceled', 'no_show'].includes(status)) {
    throw new ApiError('invalid-argument', 'Status inválido.')
  }

  if (status === 'canceled') {
    const { appt, creditReturned } = await cancelWithRefund(fs, id, { canceledBy: 'owner' })
    await notify(env, fs, {
      type: 'appointment_canceled',
      targetUserId: String(appt.clientId),
      relatedId: id,
      link: '/app/appointments',
      title: 'Horário cancelado pela barbearia',
      message:
        `Seu horário de ${appt.serviceName} em ${formatDateTimeBr(appt.date as Date)} foi cancelado.` +
        (creditReturned ? ' O crédito voltou para o seu plano.' : ''),
    })
    return { ok: true, creditReturned }
  }

  const doc = await fs.get(`appointments/${id}`)
  if (!doc) throw new ApiError('not-found', 'Horário não encontrado.')
  if (doc.data.status === 'canceled') {
    throw new ApiError('failed-precondition', 'Horário cancelado não pode ser reaberto. Marque um novo.')
  }
  await fs.update(doc.path, { status })
  return { ok: true, creditReturned: false }
}
