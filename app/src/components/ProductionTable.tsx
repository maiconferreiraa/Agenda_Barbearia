import { formatCurrency } from '../lib/format'
import type { BarberProduction } from '../lib/production'

/** Tabela de produção e comissão (uma linha por barbeiro). */
export function ProductionTable({ rows, showName = true }: { rows: BarberProduction[]; showName?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">Nenhum barbeiro cadastrado na equipe.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead className="text-left text-xs text-neutral-500">
          <tr>
            {showName && <th className="py-1 font-normal">Barbeiro</th>}
            <th className="py-1 text-right font-normal">Atend.</th>
            <th className="py-1 text-right font-normal">Avulsos</th>
            <th className="py-1 text-right font-normal">Pelo plano</th>
            <th className="py-1 text-right font-normal">Produção</th>
            <th className="py-1 text-right font-normal">Comissão</th>
          </tr>
        </thead>
        <tbody className="text-neutral-300">
          {rows.map((r) => (
            <tr key={r.barberId} className="border-t border-ink-border">
              {showName && <td className="py-1.5">{r.name}</td>}
              <td className="py-1.5 text-right tabular-nums">{r.count}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.walkInTotal)}</td>
              <td className="py-1.5 text-right tabular-nums">
                {r.planServices}× · {formatCurrency(r.planValue)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-neutral-100">{formatCurrency(r.produced)}</td>
              <td className="py-1.5 text-right tabular-nums text-neutral-100">
                {r.commissionPercent > 0 ? `${formatCurrency(r.commission)} (${r.commissionPercent}%)` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
