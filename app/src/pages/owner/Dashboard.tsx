import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/StatusBadge'
import { useAppointmentsRange } from '../../hooks/useAppointments'
import { useAllSubscriptions } from '../../hooks/useSubscriptions'
import { formatCurrency, formatTime } from '../../lib/format'
import { subscriptionHealth, HEALTH_DOT } from '../../lib/subscriptionHealth'

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export function Dashboard() {
  const today = useMemo(() => new Date(), [])
  const { data: todayAppointments, loading: loadingAppts } = useAppointmentsRange(
    startOfDay(today),
    endOfDay(today),
  )
  const { data: subscriptions, loading: loadingSubs } = useAllSubscriptions()

  const activeSubs = subscriptions.filter((s) => s.status === 'active')
  const expiringSubs = subscriptions.filter((s) => subscriptionHealth(s).level === 'expiring')
  const expiredSubs = subscriptions.filter((s) => subscriptionHealth(s).level === 'expired')
  const monthlyRevenue = activeSubs.reduce((sum, s) => sum + s.planPrice, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-neutral-100">Painel</h1>
        <p className="text-sm text-neutral-500">
          {today.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <p className="text-xs text-neutral-500">Agendamentos hoje</p>
          <p className="mt-1 font-display text-2xl text-gold-light">{todayAppointments.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-neutral-500">Assinaturas ativas</p>
          <p className="mt-1 font-display text-2xl text-gold-light">{activeSubs.length}</p>
        </Card>
        <Card className={expiringSubs.length > 0 ? 'border-amber-500/40' : ''}>
          <p className="text-xs text-neutral-500">Vencendo em breve</p>
          <p className="mt-1 font-display text-2xl text-amber-400">{expiringSubs.length}</p>
        </Card>
        <Card className={expiredSubs.length > 0 ? 'border-red-500/40' : ''}>
          <p className="text-xs text-neutral-500">Vencidas</p>
          <p className="mt-1 font-display text-2xl text-red-400">{expiredSubs.length}</p>
        </Card>
      </div>

      <Card>
        <p className="text-xs text-neutral-500">Receita mensal recorrente (assinaturas ativas)</p>
        <p className="mt-1 font-display text-3xl text-gold-light">{formatCurrency(monthlyRevenue)}</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base text-neutral-100">Agenda de hoje</h2>
            <Link to="/owner/agenda" className="text-xs text-gold-light hover:underline">
              ver agenda
            </Link>
          </div>
          {!loadingAppts && todayAppointments.length === 0 && (
            <p className="text-sm text-neutral-500">Nenhum agendamento para hoje.</p>
          )}
          <ul className="space-y-2">
            {todayAppointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg bg-ink-soft px-3 py-2 text-sm">
                <span>
                  <span className="mr-2 font-medium text-gold-light">{formatTime(a.date)}</span>
                  {a.clientName} · {a.serviceName}
                </span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base text-neutral-100">Atenção necessária</h2>
            <Link to="/owner/subscriptions" className="text-xs text-gold-light hover:underline">
              ver assinaturas
            </Link>
          </div>
          {!loadingSubs && expiringSubs.length === 0 && expiredSubs.length === 0 && (
            <p className="text-sm text-neutral-500">Nenhuma assinatura precisa de atenção agora.</p>
          )}
          <ul className="space-y-2">
            {[...expiredSubs, ...expiringSubs].map((s) => {
              const health = subscriptionHealth(s)
              return (
                <li key={s.id} className="flex items-center justify-between rounded-lg bg-ink-soft px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${HEALTH_DOT[health.level]}`} />
                    {s.clientName} · {s.planName}
                  </span>
                  <span className="text-xs text-neutral-400">{health.label}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </div>
  )
}
