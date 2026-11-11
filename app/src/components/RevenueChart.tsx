import { useEffect, useRef, useState } from 'react'
import { formatCurrency } from '../lib/format'
import type { Bucket } from '../lib/finance'

/** Cores validadas (contraste ≥ 3:1 e daltonismo) no fundo escuro do app. */
export const SERIES = {
  plans: { label: 'Mensalidades', color: '#3987e5' },
  walkIn: { label: 'Avulsos', color: '#d95926' },
} as const

const HEIGHT = 220
const PAD = { top: 12, right: 8, bottom: 26, left: 56 }

function niceMax(v: number) {
  if (v <= 0) return 100
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / exp
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * exp
}

function compactBRL(v: number, max: number) {
  if (v >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  if (max < 20) return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `R$ ${Math.round(v)}`
}

/** Caminho de barra com só o topo arredondado (4 px), apoiada na base. */
function barPath(x: number, y: number, w: number, h: number, round: boolean) {
  if (h <= 0) return ''
  const r = round ? Math.min(4, w / 2, h) : 0
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/** Receita por dia/mês, mensalidades + avulsos empilhados, com tooltip e visão em tabela. */
export function RevenueChart({ buckets }: { buckets: Bucket[] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [asTable])

  const max = niceMax(Math.max(0, ...buckets.map((b) => b.plans + b.walkIn)))
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const slot = plotW / Math.max(1, buckets.length)
  const barW = Math.max(3, Math.min(36, slot * 0.62))
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const labelEvery = buckets.length > 14 ? 5 : 1
  const hovered = hover !== null ? buckets[hover] : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-4 text-xs text-neutral-300">
          {Object.values(SERIES).map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
        >
          {asTable ? 'Ver gráfico' : 'Ver em tabela'}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1 font-normal">Data</th>
                <th className="py-1 text-right font-normal">Mensalidades</th>
                <th className="py-1 text-right font-normal">Avulsos</th>
                <th className="py-1 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody className="text-neutral-300">
              {buckets.map((b) => (
                <tr key={b.key} className="border-t border-ink-border">
                  <td className="py-1">{b.fullLabel}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(b.plans)}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(b.walkIn)}</td>
                  <td className="py-1 text-right tabular-nums text-neutral-100">{formatCurrency(b.plans + b.walkIn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} className="relative">
          <svg width={width} height={HEIGHT} role="img" aria-label="Receita por período: mensalidades e avulsos">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#2a2a2e" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#8a8a90">
                  {compactBRL(t, max)}
                </text>
              </g>
            ))}

            {buckets.map((b, i) => {
              const cx = PAD.left + slot * i + slot / 2
              const x = cx - barW / 2
              const hPlans = (b.plans / max) * plotH
              const hWalk = (b.walkIn / max) * plotH
              const base = PAD.top + plotH
              const gap = hPlans > 0 && hWalk > 0 ? 2 : 0
              const dim = hover !== null && hover !== i
              return (
                <g key={b.key} opacity={dim ? 0.45 : 1}>
                  <path d={barPath(x, base - hPlans, barW, hPlans, hWalk === 0)} fill={SERIES.plans.color} />
                  <path
                    d={barPath(x, base - hPlans - gap - hWalk, barW, hWalk, true)}
                    fill={SERIES.walkIn.color}
                  />
                  {i % labelEvery === 0 && (
                    <text x={cx} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill="#8a8a90">
                      {b.label}
                    </text>
                  )}
                  {/* área de toque maior que a barra */}
                  <rect
                    x={PAD.left + slot * i}
                    y={PAD.top}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setHover((h) => (h === i ? null : i))}
                  />
                </g>
              )
            })}
          </svg>

          {hovered && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-44 rounded-md border border-ink-border bg-ink-soft p-2 text-xs shadow-lg"
              style={{
                left: Math.min(
                  Math.max(0, PAD.left + slot * hover + slot / 2 - 88),
                  width - 176,
                ),
              }}
            >
              <p className="mb-1 font-medium text-neutral-100">{hovered.fullLabel}</p>
              <p className="flex justify-between text-neutral-300">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ background: SERIES.plans.color }} />
                  Mensalidades
                </span>
                <span className="tabular-nums">{formatCurrency(hovered.plans)}</span>
              </p>
              <p className="flex justify-between text-neutral-300">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ background: SERIES.walkIn.color }} />
                  Avulsos
                </span>
                <span className="tabular-nums">{formatCurrency(hovered.walkIn)}</span>
              </p>
              <p className="mt-1 flex justify-between border-t border-ink-border pt-1 text-neutral-100">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(hovered.plans + hovered.walkIn)}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
