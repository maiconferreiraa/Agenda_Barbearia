import { useState } from 'react'
import { setAppointmentStatusFn } from '../../lib/bookingApi'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { Spinner } from '../../components/ui/Spinner'
import { useAppointmentsRange } from '../../hooks/useAppointments'
import { appointmentPaymentLabel, formatTime } from '../../lib/format'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { weekdayKeyFor } from '../../lib/schedule'
import type { Appointment, AppointmentStatus } from '../../types'

function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
function minutesOf(a: Appointment) {
  const d = a.date.toDate()
  return d.getHours() * 60 + d.getMinutes()
}
function hhmm(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

interface Slot {
  start: number
  appointments: Appointment[]
  /** Atendimento que começou antes e ainda ocupa este horário. */
  continuing?: Appointment
}

/** Monta a grade do dia (abertura → fechamento, de `step` em `step` minutos). */
function buildDay(open: number, close: number, step: number, appts: Appointment[]) {
  const active = appts.filter((a) => a.status !== 'canceled')
  const slots: Slot[] = []
  for (let t = open; t < close; t += step) {
    const starting = appts.filter((a) => minutesOf(a) >= t && minutesOf(a) < t + step)
    const continuing = active.find((a) => minutesOf(a) < t && minutesOf(a) + a.durationMinutes > t)
    slots.push({ start: t, appointments: starting, continuing })
  }
  const outside = appts.filter((a) => minutesOf(a) < open || minutesOf(a) >= close)
  return { slots, outside }
}

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
    { label: 'Concluir', to: 'done' },
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
  const { settings } = useBusinessSettings()
  const dayHours = settings.hours[weekdayKeyFor(day)]
  const isOpen = !!dayHours?.enabled
  const step = settings.slotDurationMinutes || 60
  const grid = isOpen
    ? buildDay(toMinutes(dayHours.open), toMinutes(dayHours.close), step, appointments)
    : { slots: [] as Slot[], outside: appointments }

  async function changeStatus(id: string, status: AppointmentStatus) {
    try {
      await setAppointmentStatusFn({ appointmentId: id, status })
    } catch (err) {
      alert((err as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-neutral-100">Agenda</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" aria-label="Dia anterior" onClick={() => setDay(addDays(day, -1))} className="!px-3 !py-1.5">
            ‹
          </Button>
          <Button variant="secondary" onClick={() => setDay(startOfDay(new Date()))} className="!px-3 !py-1.5 text-sm">
            Hoje
          </Button>
          <Button variant="secondary" aria-label="Próximo dia" onClick={() => setDay(addDays(day, 1))} className="!px-3 !py-1.5">
            ›
          </Button>
        </div>
      </div>

      <p className="text-sm text-neutral-400 first-letter:uppercase">
        {day.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
      </p>

      {loading && <Spinner full />}

      {!loading && isOpen && (
        <p className="text-xs text-neutral-500">
          Aberto das {dayHours.open} às {dayHours.close} · horários de {step} min
        </p>
      )}

      {!loading && !isOpen && (
        <Card className="text-center text-sm text-neutral-500">
          Fechado neste dia. (Horário de funcionamento em Configurações.)
        </Card>
      )}

      {!loading && (
        <div className="space-y-1.5">
          {grid.slots.map((slot) => (
            <div key={slot.start} className="flex gap-3">
              <div className="w-14 shrink-0 pt-3 text-right font-display text-sm text-gold-light tabular-nums">
                {hhmm(slot.start)}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                {slot.appointments.map((a) => (
                  <AppointmentCard key={a.id} a={a} onChange={changeStatus} />
                ))}
                {slot.appointments.every((a) => a.status === 'canceled') &&
                  (slot.continuing ? (
                    <div className="rounded-lg border border-dashed border-ink-border px-3 py-2.5 text-xs text-neutral-500">
                      Ocupado — continuação de {slot.continuing.clientName} ({formatTime(slot.continuing.date)})
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-ink-border px-3 py-2.5 text-xs text-emerald-400/80">
                      Livre
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && grid.outside.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500">{isOpen ? 'Fora do horário de funcionamento' : 'Agendamentos'}</p>
          {grid.outside.map((a) => (
            <AppointmentCard key={a.id} a={a} onChange={changeStatus} showTime />
          ))}
        </div>
      )}
    </div>
  )
}

function AppointmentCard({
  a,
  onChange,
  showTime = false,
}: {
  a: Appointment
  onChange: (id: string, status: AppointmentStatus) => void
  showTime?: boolean
}) {
  return (
    <Card className={`flex flex-wrap items-center justify-between gap-3 !py-3 ${a.status === 'canceled' ? 'opacity-50' : ''}`}>
      <div className="flex min-w-0 items-center gap-3">
        {showTime && <p className="w-12 font-display text-sm text-gold-light">{formatTime(a.date)}</p>}
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-100">
            {a.clientName}
            {!showTime && <span className="ml-2 text-xs font-normal text-neutral-500">{formatTime(a.date)}</span>}
          </p>
          <p className="text-xs text-neutral-400">
            {a.serviceName} · {a.durationMinutes} min · {appointmentPaymentLabel(a)}
          </p>
          {a.clientPhone && <p className="text-xs text-neutral-600">{a.clientPhone}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={a.status} />
        {NEXT_STATUS[a.status]?.map((opt) => (
          <Button
            key={opt.to}
            variant={opt.to === 'canceled' ? 'danger' : 'secondary'}
            onClick={() => onChange(a.id, opt.to)}
            className="!px-2.5 !py-1.5 text-xs"
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </Card>
  )
}
