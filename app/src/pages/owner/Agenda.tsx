import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { Spinner } from '../../components/ui/Spinner'
import { useAppointmentsRange } from '../../hooks/useAppointments'
import { formatCurrency, formatTime } from '../../lib/format'
import type { AppointmentStatus } from '../../types'

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
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const NEXT_STATUS: Partial<Record<AppointmentStatus, { label: string; to: AppointmentStatus }[]>> = {
  scheduled: [
    { label: 'Confirmar', to: 'confirmed' },
    { label: 'Cancelar', to: 'canceled' },
  ],
  confirmed: [
    { label: 'Concluir', to: 'done' },
    { label: 'Não compareceu', to: 'no_show' },
    { label: 'Cancelar', to: 'canceled' },
  ],
}

export function Agenda() {
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const { data: appointments, loading } = useAppointmentsRange(day, endOfDay(day))

  async function changeStatus(id: string, status: AppointmentStatus) {
    await updateDoc(doc(db, 'appointments', id), { status })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-neutral-100">Agenda</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setDay(addDays(day, -1))}>
            ← Anterior
          </Button>
          <Button variant="secondary" onClick={() => setDay(startOfDay(new Date()))}>
            Hoje
          </Button>
          <Button variant="secondary" onClick={() => setDay(addDays(day, 1))}>
            Próximo →
          </Button>
        </div>
      </div>

      <p className="text-sm text-neutral-400 capitalize">
        {day.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
      </p>

      {loading && <Spinner full />}

      {!loading && appointments.length === 0 && (
        <Card className="text-center text-sm text-neutral-500">Nenhum agendamento neste dia.</Card>
      )}

      <div className="space-y-2">
        {appointments.map((a) => (
          <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="w-14 text-center">
                <p className="font-display text-lg text-gold-light">{formatTime(a.date)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-100">{a.clientName}</p>
                <p className="text-xs text-neutral-400">
                  {a.serviceName} · {a.durationMinutes} min ·{' '}
                  {a.usedPlanCredit ? 'crédito do plano' : formatCurrency(a.price)}
                </p>
                {a.clientPhone && <p className="text-xs text-neutral-600">{a.clientPhone}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={a.status} />
              {NEXT_STATUS[a.status]?.map((opt) => (
                <Button
                  key={opt.to}
                  variant={opt.to === 'canceled' ? 'danger' : 'secondary'}
                  onClick={() => changeStatus(a.id, opt.to)}
                  className="!px-2.5 !py-1.5 text-xs"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
