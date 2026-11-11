import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Card } from '../../components/ui/Card'
import { Spinner } from '../../components/ui/Spinner'
import { RevenueChart, SERIES } from '../../components/RevenueChart'
import { useAppointmentsRange } from '../../hooks/useAppointments'
import { usePaymentsRange } from '../../hooks/usePayments'
import { useExpenses } from '../../hooks/useExpenses'
import { ExpensesCard } from '../../components/ExpensesCard'
import { buildReport, periodFor, type PeriodKind, type Row } from '../../lib/finance'
import { formatCurrency } from '../../lib/format'
import { exportCsv, exportPdf } from '../../lib/financeExport'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { Button } from '../../components/ui/Button'

const KINDS: { kind: PeriodKind; label: string }[] = [
  { kind: 'week', label: 'Semana' },
  { kind: 'month', label: 'Mês' },
  { kind: 'year', label: 'Ano' },
]

function RowsTable({ rows, empty, valueLabel, showTotal = true }: {
  rows: Row[]
  empty: string
  valueLabel: string
  showTotal?: boolean
}) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">{empty}</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-neutral-500">
        <tr>
          <th className="py-1 font-normal">Nome</th>
          <th className="py-1 text-right font-normal">{valueLabel}</th>
          {showTotal && <th className="py-1 text-right font-normal">Total</th>}
        </tr>
      </thead>
      <tbody className="text-neutral-300">
        {rows.map((r) => (
          <tr key={r.name} className="border-t border-ink-border">
            <td className="py-1.5">{r.name}</td>
            <td className="py-1.5 text-right tabular-nums">{r.count}</td>
            {showTotal && <td className="py-1.5 text-right tabular-nums text-neutral-100">{formatCurrency(r.total)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Relatório financeiro do dono: mensalidades (planos) e avulsos por semana, mês ou ano. */
export function Finance() {
  const [kind, setKind] = useState<PeriodKind>('month')
  const [offset, setOffset] = useState(0)
  const period = useMemo(() => periodFor(kind, new Date(), offset), [kind, offset])

  const { data: payments, loading: loadingPay } = usePaymentsRange(period.start, period.end)
  const { data: appointments, loading: loadingAppt } = useAppointmentsRange(period.start, period.end)
  const { data: expenses, loading: loadingExp } = useExpenses()
  const report = useMemo(
    () => buildReport(period, payments, appointments, expenses),
    [period, payments, appointments, expenses],
  )
  const total = report.plansTotal + report.walkInTotal
  const loading = loadingPay || loadingAppt || loadingExp
  const profit = total - report.expensesTotal
  const { settings } = useBusinessSettings()
  const [exporting, setExporting] = useState(false)

  async function handlePdf() {
    setExporting(true)
    try {
      await exportPdf(settings.name, period, report)
    } catch (err) {
      alert('Não foi possível gerar o PDF. ' + (err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-neutral-100">Financeiro</h1>

      {/* filtros numa linha: tipo de período + navegação */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-ink-border p-0.5">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => {
                setKind(k.kind)
                setOffset(0)
              }}
              className={clsx(
                'rounded px-3 py-1.5 text-sm',
                kind === k.kind ? 'bg-gold text-ink' : 'text-neutral-400 hover:text-neutral-200',
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Período anterior"
            onClick={() => setOffset((o) => o - 1)}
            className="rounded px-2 py-1 text-lg text-neutral-400 hover:text-neutral-100"
          >
            ‹
          </button>
          <span className="min-w-36 text-center text-sm capitalize text-neutral-200">{period.label}</span>
          <button
            type="button"
            aria-label="Próximo período"
            disabled={offset >= 0}
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            className="rounded px-2 py-1 text-lg text-neutral-400 hover:text-neutral-100 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner full />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <p className="text-xs text-neutral-500">Entradas</p>
              <p className="mt-1 font-display text-lg text-emerald-300 tabular-nums md:text-2xl">{formatCurrency(total)}</p>
            </Card>
            <Card>
              <p className="text-xs text-neutral-500">Saídas</p>
              <p className="mt-1 font-display text-lg text-red-300 tabular-nums md:text-2xl">
                {formatCurrency(report.expensesTotal)}
              </p>
            </Card>
            <Card className={profit < 0 ? 'border-red-500/40' : 'border-gold/40'}>
              <p className="text-xs text-neutral-500">{profit < 0 ? 'Prejuízo' : 'Lucro'}</p>
              <p className={`mt-1 font-display text-lg tabular-nums md:text-2xl ${profit < 0 ? 'text-red-400' : 'text-gold-light'}`}>
                {formatCurrency(profit)}
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card className="col-span-2 md:col-span-1">
              <p className="text-xs text-neutral-500">Total recebido</p>
              <p className="mt-1 font-display text-3xl text-gold-light tabular-nums">{formatCurrency(total)}</p>
            </Card>
            <Card>
              <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="h-2 w-2 rounded-sm" style={{ background: SERIES.plans.color }} />
                Mensalidades
              </p>
              <p className="mt-1 font-display text-xl text-neutral-100 tabular-nums">{formatCurrency(report.plansTotal)}</p>
              <p className="text-xs text-neutral-500">{report.plansCount} pagamento(s)</p>
            </Card>
            <Card>
              <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="h-2 w-2 rounded-sm" style={{ background: SERIES.walkIn.color }} />
                Avulsos (balcão)
              </p>
              <p className="mt-1 font-display text-xl text-neutral-100 tabular-nums">{formatCurrency(report.walkInTotal)}</p>
              <p className="text-xs text-neutral-500">{report.walkInCount} atendimento(s)</p>
            </Card>
            <Card>
              <p className="text-xs text-neutral-500">Serviços pelo plano</p>
              <p className="mt-1 font-display text-xl text-neutral-100 tabular-nums">{report.creditUses}</p>
              <p className="text-xs text-neutral-500">já pagos na mensalidade</p>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={exporting} onClick={handlePdf} className="!px-3 !py-1.5 text-xs">
              ⬇ Baixar PDF
            </Button>
            <Button
              variant="secondary"
              onClick={() => exportCsv(settings.name, period, report)}
              className="!px-3 !py-1.5 text-xs"
            >
              ⬇ Baixar CSV (Excel)
            </Button>
          </div>

          {report.notClosed > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5 text-sm text-amber-300">
              ⚠️ {report.notClosed} atendimento(s) deste período já passaram e não foram marcados como{' '}
              <b>Concluído</b> — o valor deles ainda não entra nos avulsos.{' '}
              <Link to="/owner/agenda" className="underline underline-offset-2">
                Abrir agenda
              </Link>
            </Card>
          )}

          <Card>
            <h2 className="mb-3 font-display text-base text-neutral-100">
              Receita por {kind === 'year' ? 'mês' : 'dia'}
            </h2>
            <RevenueChart buckets={report.buckets} />
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h2 className="mb-2 font-display text-base text-neutral-100">Mensalidades por plano</h2>
              <RowsTable rows={report.byPlan} valueLabel="Pagamentos" empty="Nenhuma mensalidade paga neste período." />
            </Card>
            <Card>
              <h2 className="mb-2 font-display text-base text-neutral-100">Avulsos por serviço</h2>
              <RowsTable rows={report.byService} valueLabel="Qtd." empty="Nenhum avulso concluído neste período." />
            </Card>
            <div className="md:col-span-2">
              <ExpensesCard report={report} period={period} expenses={expenses} />
            </div>
            <Card className="md:col-span-2">
              <h2 className="mb-2 font-display text-base text-neutral-100">Serviços feitos pelo plano</h2>
              <RowsTable
                rows={report.creditByService}
                valueLabel="Vezes"
                showTotal={false}
                empty="Nenhum serviço feito com crédito do plano neste período."
              />
            </Card>
          </div>

          <p className="text-xs text-neutral-500">
            Mensalidades contam pela data do pagamento (InfinitePay). Avulsos contam pela data do atendimento, só
            quando marcado como <b>Concluído</b> na agenda.
          </p>
        </>
      )}
    </div>
  )
}
