const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export interface DayHours {
  enabled: boolean
  open: string
  close: string
}

export interface BusinessHours {
  hours: Record<(typeof WEEKDAY_KEYS)[number], DayHours>
  slotDurationMinutes: number
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function weekdayKeyFor(date: Date) {
  return WEEKDAY_KEYS[date.getDay()]
}

/** Gera os horários de início possíveis do dia, sem descontar ocupação. */
export function dayStartSlots(day: Date, serviceDurationMinutes: number, settings: BusinessHours): Date[] {
  const dayHours = settings.hours[weekdayKeyFor(day)]
  if (!dayHours || !dayHours.enabled) return []

  const step = settings.slotDurationMinutes || 30
  const openMin = timeToMinutes(dayHours.open)
  const closeMin = timeToMinutes(dayHours.close)

  const now = new Date()
  const isToday =
    day.getFullYear() === now.getFullYear() &&
    day.getMonth() === now.getMonth() &&
    day.getDate() === now.getDate()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const slots: Date[] = []
  for (let start = openMin; start + serviceDurationMinutes <= closeMin; start += step) {
    if (isToday && start <= nowMin) continue
    const slotDate = new Date(day)
    slotDate.setHours(0, 0, 0, 0)
    slotDate.setMinutes(start)
    slots.push(slotDate)
  }
  return slots
}
