import clsx from 'clsx'
import type { Period, PeriodKind } from '../lib/finance'

const KINDS: { kind: PeriodKind; label: string }[] = [
  { kind: 'week', label: 'Semana' },
  { kind: 'month', label: 'Mês' },
  { kind: 'year', label: 'Ano' },
]

/** Semana / Mês / Ano + ‹ período › (mesmo jeito do Financeiro). */
export function PeriodPicker({
  kind,
  offset,
  period,
  onKind,
  onOffset,
}: {
  kind: PeriodKind
  offset: number
  period: Period
  onKind: (k: PeriodKind) => void
  onOffset: (o: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-md border border-ink-border p-0.5">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            onClick={() => {
              onKind(k.kind)
              onOffset(0)
            }}
            className={clsx('rounded px-3 py-1.5 text-sm', kind === k.kind ? 'bg-gold text-ink' : 'text-neutral-400 hover:text-neutral-200')}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Período anterior" onClick={() => onOffset(offset - 1)} className="rounded px-2 py-1 text-lg text-neutral-400 hover:text-neutral-100">
          ‹
        </button>
        <span className="min-w-36 text-center text-sm text-neutral-200 first-letter:uppercase">{period.label}</span>
        <button
          type="button"
          aria-label="Próximo período"
          disabled={offset >= 0}
          onClick={() => onOffset(Math.min(0, offset + 1))}
          className="rounded px-2 py-1 text-lg text-neutral-400 hover:text-neutral-100 disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>
  )
}
