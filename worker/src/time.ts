/**
 * Horário de Brasília (UTC−3, sem horário de verão desde 2019).
 * O Worker roda em UTC, então tudo que depende de "que horas são na barbearia"
 * passa por aqui.
 */
const OFFSET_MS = 3 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000

/** Partes da data no horário de Brasília. */
export function sp(date: Date) {
  const d = new Date(date.getTime() - OFFSET_MS)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  }
}

/** Instante correspondente a ano/mês/dia + minutos do dia, no horário de Brasília. */
export function spDate(year: number, month: number, day: number, minutes = 0): Date {
  return new Date(Date.UTC(year, month, day, 0, minutes) + OFFSET_MS)
}

/** Meia-noite (Brasília) do dia da data. */
export function spDayStart(date: Date): Date {
  const p = sp(date)
  return spDate(p.year, p.month, p.day)
}

export function formatBr(date: Date) {
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function formatDateTimeBr(date: Date) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

/** +N meses no calendário (31/01 + 1 → último dia de fevereiro). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime())
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + months)
  if (d.getUTCDate() < day) d.setUTCDate(0)
  return d
}

export function brl(value: unknown) {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`
}
