/** Quantos dias para frente aparecem para agendar. */
export const BOOKING_DAYS_AHEAD = 60

/** Próximos `n` dias a partir de `from` (nunca antes de hoje), à meia-noite. */
export function nextDays(n = BOOKING_DAYS_AHEAD, from: Date = new Date()) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const base = new Date(from)
  base.setHours(0, 0, 0, 0)
  const start = base < today ? today : base
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
}

/** Faixa rolável de dias; mostra o mês no primeiro dia e quando o mês vira. */
export function DayStrip({
  days,
  selected,
  onSelect,
}: {
  days: Date[]
  selected: Date
  onSelect: (d: Date) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {days.map((d, i) => {
        const on = d.toDateString() === selected.toDateString()
        const showMonth = i === 0 || d.getDate() === 1
        return (
          <button
            key={d.toISOString()}
            type="button"
            onClick={() => onSelect(d)}
            className={`flex shrink-0 flex-col items-center rounded-lg border px-3 py-2 ${on ? 'border-gold bg-gold/10' : 'border-ink-border bg-ink-card'}`}
          >
            <span className="text-[10px] uppercase text-neutral-500">
              {d.toLocaleDateString('pt-BR', { weekday: 'short' })}
            </span>
            <span className="text-sm font-medium text-neutral-100">{d.getDate()}</span>
            <span className={`text-[10px] uppercase ${showMonth ? 'text-gold' : 'invisible'}`}>
              {d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
            </span>
          </button>
        )
      })}
    </div>
  )
}
