import type { Appointment, BusinessSettings, UserProfile } from '../types'

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export function weekdayKeyFor(date: Date) {
  return WEEKDAY_KEYS[date.getDay()]
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Gera os horários disponíveis de um dia, descontando agendamentos já ocupados. */
export function availableSlots(
  day: Date,
  serviceDurationMinutes: number,
  settings: BusinessSettings,
  existingAppointments: Appointment[],
): Date[] {
  const dayHours = settings.hours[weekdayKeyFor(day)]
  if (!dayHours || !dayHours.enabled) return []

  const step = settings.slotDurationMinutes || 30
  const openMin = timeToMinutes(dayHours.open)
  const closeMin = timeToMinutes(dayHours.close)

  const busyRanges = existingAppointments
    .filter((a) => a.status !== 'canceled')
    .map((a) => {
      const start = a.date.toDate()
      const startMin = start.getHours() * 60 + start.getMinutes()
      return { start: startMin, end: startMin + a.durationMinutes }
    })

  const now = new Date()
  const isToday =
    day.getFullYear() === now.getFullYear() &&
    day.getMonth() === now.getMonth() &&
    day.getDate() === now.getDate()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const slots: Date[] = []
  for (let start = openMin; start + serviceDurationMinutes <= closeMin; start += step) {
    if (isToday && start <= nowMin) continue
    const end = start + serviceDurationMinutes
    const overlaps = busyRanges.some((b) => start < b.end && end > b.start)
    if (overlaps) continue
    const slotDate = new Date(day)
    slotDate.setHours(0, 0, 0, 0)
    slotDate.setMinutes(start)
    slots.push(slotDate)
  }
  return slots
}

export const DEFAULT_BUSINESS_HOURS: BusinessSettings['hours'] = {
  mon: { enabled: true, open: '09:00', close: '19:00' },
  tue: { enabled: true, open: '09:00', close: '19:00' },
  wed: { enabled: true, open: '09:00', close: '19:00' },
  thu: { enabled: true, open: '09:00', close: '19:00' },
  fri: { enabled: true, open: '09:00', close: '19:00' },
  sat: { enabled: true, open: '09:00', close: '17:00' },
  sun: { enabled: false, open: '09:00', close: '13:00' },
}

export const WEEKDAY_LABELS: Record<keyof BusinessSettings['hours'], string> = {
  mon: 'Segunda',
  tue: 'Terça',
  wed: 'Quarta',
  thu: 'Quinta',
  fri: 'Sexta',
  sat: 'Sábado',
  sun: 'Domingo',
}

/** Dias/horários e almoço que valem para quem atende: os dele, se configurou; senão os da barbearia. */
export function scheduleOf(settings: BusinessSettings, member?: Pick<UserProfile, 'schedule'> | null) {
  const own = member?.schedule
  if (!own?.hours) return { hours: settings.hours, lunch: settings.lunch, own: false }
  return { hours: own.hours, lunch: own.lunch ?? { enabled: false, start: '12:00', end: '13:00' }, own: true }
}

/** Junta os horários de vários barbeiros (visão "Todos" da agenda): abre no mais cedo, fecha no mais tarde. */
export function mergedSchedule(settings: BusinessSettings, members: Pick<UserProfile, 'schedule'>[]) {
  if (members.length === 0) return scheduleOf(settings)
  const each = members.map((m) => scheduleOf(settings, m))
  const hours = { ...settings.hours }
  for (const k of Object.keys(hours) as (keyof BusinessSettings['hours'])[]) {
    const on = each.map((e) => e.hours[k]).filter((d) => d?.enabled)
    hours[k] = on.length
      ? { enabled: true, open: on.map((d) => d.open).sort()[0], close: on.map((d) => d.close).sort().at(-1)! }
      : { ...hours[k], enabled: false }
  }
  const l = each.map((e) => e.lunch)
  const same = l.every((x) => x?.enabled && x.start === l[0]?.start && x.end === l[0]?.end)
  return { hours, lunch: same ? l[0] : undefined, own: false }
}
