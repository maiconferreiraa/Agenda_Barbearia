import { useMemo, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Spinner } from '../../components/ui/Spinner'
import { PeriodPicker } from '../../components/PeriodPicker'
import { ProductionTable } from '../../components/ProductionTable'
import { useAuth } from '../../contexts/AuthContext'
import { useBarberAppointments } from '../../hooks/useAppointments'
import { formatCurrency } from '../../lib/format'
import { periodFor, type PeriodKind } from '../../lib/finance'
import { productionByBarber } from '../../lib/production'

/** Colaborador: o que ele produziu no período e a comissão dele. */
export function BarberProduction() {
  const { profile } = useAuth()
  const [kind, setKind] = useState<PeriodKind>('month')
  const [offset, setOffset] = useState(0)
  const period = useMemo(() => periodFor(kind, new Date(), offset), [kind, offset])
  const { data: appts, loading } = useBarberAppointments(profile?.uid)
  const [row] = profile ? productionByBarber(appts, [profile], period.start, period.end) : []
  const done = appts
    .filter((a) => a.status === 'done' && a.date.toDate() >= period.start && a.date.toDate() <= period.end)
    .sort((a, b) => b.date.toMillis() - a.date.toMillis())

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Minha produção</h1>
      <PeriodPicker kind={kind} offset={offset} period={period} onKind={setKind} onOffset={setOffset} />
      {loading && <Spinner full />}
      {row && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card>
            <p className="text-xs text-neutral-500">Atendimentos</p>
            <p className="mt-1 font-display text-2xl text-neutral-100">{row.count}</p>
          </Card>
          <Card>
            <p className="text-xs text-neutral-500">Produção</p>
            <p className="mt-1 font-display text-2xl text-neutral-100">{formatCurrency(row.produced)}</p>
          </Card>
          <Card>
            <p className="text-xs text-neutral-500">Pelo plano</p>
            <p className="mt-1 font-display text-2xl text-neutral-100">{row.planServices}</p>
            <p className="text-xs text-neutral-500">{formatCurrency(row.planValue)} de tabela</p>
          </Card>
          <Card className="border-gold/40">
            <p className="text-xs text-neutral-500">Minha comissão ({row.commissionPercent}%)</p>
            <p className="mt-1 font-display text-2xl text-gold-light">{formatCurrency(row.commission)}</p>
          </Card>
        </div>
      )}
      {row && (
        <Card>
          <ProductionTable rows={[row]} showName={false} />
        </Card>
      )}
      <Card>
        <h2 className="mb-2 font-display text-base text-neutral-100">Atendimentos concluídos</h2>
        {done.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum atendimento concluído neste período.</p>
        ) : (
          <ul className="divide-y divide-ink-border text-sm">
            {done.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-1.5">
                <span className="text-neutral-300">
                  {a.date.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {a.clientName} ·{' '}
                  {a.serviceName}
                </span>
                <span className="tabular-nums text-neutral-400">{a.usedPlanCredit && a.price === 0 ? 'plano' : formatCurrency(a.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-neutral-500">
        Só contam os horários marcados como <b>Concluído</b>. Serviço feito pelo plano entra na produção pelo preço de tabela.
      </p>
    </div>
  )
}
