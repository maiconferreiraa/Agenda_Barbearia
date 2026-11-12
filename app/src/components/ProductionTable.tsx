import { formatCurrency } from '../lib/format'
import type { BarberProduction } from '../lib/production'

/** Tabela de produção e comissão (uma linha por barbeiro), com os avulsos separados por forma de pagamento. */
export function ProductionTable({
  rows,
  showName = true,
  onReport,
}: {
  rows: BarberProduction[]
  showName?: boolean
  /** Botão de relatório individual (PDF) em cada linha. */
  onReport?: (row: BarberProduction) => void
}) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">Nenhum barbeiro cadastrado na equipe.</p>
  const anyWithout = rows.some((r) => r.byMethod.semForma > 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="text-left text-xs text-neutral-500">
          <tr>
            {showName && <th className="py-1 font-normal">Barbeiro</th>}
            <th className="py-1 text-right font-normal">Atend.</th>
            <th className="py-1 text-right font-normal">Pix</th>
            <th className="py-1 text-right font-normal">Dinheiro</th>
            <th className="py-1 text-right font-normal">Cartão</th>
            {anyWithout && <th className="py-1 text-right font-normal">Sem forma</th>}
            <th className="py-1 text-right font-normal">Pelo plano</th>
            <th className="py-1 text-right font-normal">Produção</th>
            <th className="py-1 text-right font-normal">Comissão</th>
            {onReport && <th className="py-1" />}
          </tr>
        </thead>
        <tbody className="text-neutral-300">
          {rows.map((r) => (
            <tr key={r.barberId} className="border-t border-ink-border">
              {showName && <td className="py-1.5">{r.name}</td>}
              <td className="py-1.5 text-right tabular-nums">{r.count}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.byMethod.pix)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.byMethod.dinheiro)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.byMethod.cartao)}</td>
              {anyWithout && <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.byMethod.semForma)}</td>}
              <td className="py-1.5 text-right tabular-nums">
                {r.planServices}× · {formatCurrency(r.planValue)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-neutral-100">{formatCurrency(r.produced)}</td>
              <td className="py-1.5 text-right tabular-nums text-neutral-100">
                {r.commissionPercent > 0 ? `${formatCurrency(r.commission)} (${r.commissionPercent}%)` : '—'}
              </td>
              {onReport && (
                <td className="py-1.5 pl-2 text-right">
                  <button
                    type="button"
                    onClick={() => onReport(r)}
                    className="rounded-md border border-ink-border px-2 py-0.5 text-xs text-neutral-300 hover:text-neutral-100"
                  >
                    ⬇ PDF
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
