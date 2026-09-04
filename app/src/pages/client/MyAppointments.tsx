import { Card } from '../../components/ui/Card'
import { Spinner } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/StatusBadge'
import { useAuth } from '../../contexts/AuthContext'
import { useClientAppointments } from '../../hooks/useAppointments'
import { formatCurrency, formatDateTime } from '../../lib/format'

export function MyAppointments() {
  const { profile } = useAuth()
  const { data: appointments, loading } = useClientAppointments(profile?.uid)

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Meus horários</h1>

      {loading && <Spinner full />}

      {!loading && appointments.length === 0 && (
        <Card className="text-center text-sm text-neutral-400">
          Você ainda não tem agendamentos. Vá em "Agendar" para marcar um horário.
        </Card>
      )}

      <div className="space-y-2">
        {appointments.map((a) => (
          <Card key={a.id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-100">{a.serviceName}</p>
              <p className="text-xs text-neutral-500">{formatDateTime(a.date)}</p>
              <p className="text-xs text-neutral-600">
                {a.usedPlanCredit ? 'Crédito do plano' : formatCurrency(a.price)}
              </p>
            </div>
            <StatusBadge status={a.status} />
          </Card>
        ))}
      </div>
    </div>
  )
}
