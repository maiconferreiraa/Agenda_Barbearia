const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Aniversário (dia e mês, sem ano). Valor "MM-DD" ou "" (não informado). */
export function BirthdayInput({
  value,
  onChange,
  label = 'Aniversário (opcional)',
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const [mm, dd] = value ? value.split('-') : ['', '']
  const set = (m: string, d: string) => onChange(m && d ? `${m}-${d}` : '')
  const cls = 'w-full rounded-lg border border-ink-border bg-ink-soft px-3 py-2.5 text-sm text-neutral-100'
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-neutral-400">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <select className={cls} value={dd} onChange={(e) => set(mm || '01', e.target.value)}>
          <option value="">Dia</option>
          {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => (
            <option key={d} value={d}>
              {Number(d)}
            </option>
          ))}
        </select>
        <select className={cls} value={mm} onChange={(e) => set(e.target.value, dd || '01')}>
          <option value="">Mês</option>
          {MESES.map((n, i) => (
            <option key={n} value={String(i + 1).padStart(2, '0')}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <span className="mt-1 block text-xs text-neutral-500">Para receber um mimo da barbearia no seu dia 🎉</span>
    </div>
  )
}
