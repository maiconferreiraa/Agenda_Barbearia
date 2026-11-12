// Mesma lista em worker/src/holidayCalendar.ts e app/src/lib/holidayCalendar.ts — mantenha as duas iguais.
/** Feriados nacionais do Brasil de um ano (inclui os que dependem da Páscoa). */
export interface NationalHoliday {
  /** chave estável entre os anos (para "fechar todo ano") */
  key: string
  name: string
  /** AAAA-MM-DD */
  ymd: string
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function easter(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymdOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86400000)

export function nationalHolidays(year: number): NationalHoliday[] {
  const e = easter(year)
  const fixed = (m: number, d: number) => `${year}-${pad(m)}-${pad(d)}`
  return [
    { key: 'ano-novo', name: 'Ano Novo', ymd: fixed(1, 1) },
    { key: 'carnaval-segunda', name: 'Carnaval (segunda)', ymd: ymdOf(shift(e, -48)) },
    { key: 'carnaval-terca', name: 'Carnaval (terça)', ymd: ymdOf(shift(e, -47)) },
    { key: 'sexta-santa', name: 'Sexta-feira Santa', ymd: ymdOf(shift(e, -2)) },
    { key: 'tiradentes', name: 'Tiradentes', ymd: fixed(4, 21) },
    { key: 'trabalho', name: 'Dia do Trabalho', ymd: fixed(5, 1) },
    { key: 'corpus-christi', name: 'Corpus Christi', ymd: ymdOf(shift(e, 60)) },
    { key: 'independencia', name: 'Independência do Brasil', ymd: fixed(9, 7) },
    { key: 'aparecida', name: 'Nossa Senhora Aparecida', ymd: fixed(10, 12) },
    { key: 'finados', name: 'Finados', ymd: fixed(11, 2) },
    { key: 'republica', name: 'Proclamação da República', ymd: fixed(11, 15) },
    { key: 'consciencia-negra', name: 'Consciência Negra', ymd: fixed(11, 20) },
    { key: 'vespera-natal', name: 'Véspera de Natal', ymd: fixed(12, 24) },
    { key: 'natal', name: 'Natal', ymd: fixed(12, 25) },
    { key: 'vespera-ano-novo', name: 'Véspera de Ano Novo', ymd: fixed(12, 31) },
  ].sort((a, b) => a.ymd.localeCompare(b.ymd))
}
