import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/StatusBadge'
import { useAuth } from '../../contexts/AuthContext'
import { useClientAppointments } from '../../hooks/useAppointments'
import { appointmentPaymentLabel, formatDateTime } from '../../lib/format'
import { CLIENT_CANCEL_MIN_HOURS, cancelMyAppointmentFn } from '../../lib/bookingApi'
import type { Appointment } from '../../types'

const MIN_MS = CLIENT_CANCEL_MIN_HOURS * 60 * 60 * 1000

function cancelInfo(a: Appointment): 'can' | 'too_late' | null {
  if (a.status !== 'scheduled' && a.status !== 'confirmed') return null
  const ms = a.date.toDate().getTime() - Date.now()
  if (ms <= 0) return null
  return ms >= MIN_MS ? 'can' : 'too_late'
}

export function MyAppointments() {
  const { profile } = useAuth()
  const { data: appointments, loading } = useClientAppointments(profile?.uid)
  const [canceling, setCanceling] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleCancel(a: Appointment) {
    const credito = a.usedPlanCredit ? ' O crédito do seu plano volta pra você.' : ''
    if (!confirm(`Desmarcar ${a.serviceName} de ${formatDateTime(a.date)}?${credito}`)) return
    setCanceling(a.id)
    setMessage('')
    setError('')
    try {
      const res = await cancelMyAppointmentFn({ appointmentId: a.id })
      setMessage(
        res.data.creditReturned
          ? 'Horário desmarcado. O crédito voltou para o seu plano.'
          : 'Horário desmarcado.',
      )
    } catch (err) {
      setError((err as Error).message || 'Não foi possível desmarcar.')
    } finally {
      setCanceling(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Meus horários</h1>

      {message && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 text-sm text-emerald-300">{message}</Card>
      )}
      {error && <Card className="border-red-500/30 bg-red-500/5 text-sm text-red-300">{error}</Card>}

      {loading && <Spinner full />}

      {!loading && appointments.length === 0 && (
        <Card className="text-center text-sm text-neutral-400">
          Você ainda não tem agendamentos. Vá em "Agendar" para marcar um horário.
        </Card>
      )}

      <div className="space-y-2">
        {appointments.map((a) => {
          const info = cancelInfo(a)
          return (
            <Card key={a.id} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-100">{a.serviceName}</p>
                  <p className="text-xs text-neutral-500">{formatDateTime(a.date)}</p>
                  <p className="text-xs text-neutral-600">{appointmentPaymentLabel(a)}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
              {info === 'can' && (
                <Button
                  variant="secondary"
                  loading={canceling === a.id}
                  onClick={() => handleCancel(a)}
                  className="!px-3 !py-1.5 text-xs"
                >
                  Desmarcar
                </Button>
              )}
              {info === 'too_late' && (
                <p className="text-xs text-neutral-500">
                  Faltam menos de {CLIENT_CANCEL_MIN_HOURS} h — para desmarcar, fale com a barbearia.
                </p>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
