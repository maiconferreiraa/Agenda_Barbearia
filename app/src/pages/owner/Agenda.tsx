import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Timestamp, addDoc, collection, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../../firebase'
import { setAppointmentStatusFn } from '../../lib/bookingApi'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { Spinner } from '../../components/ui/Spinner'
import { useAppointmentsRange, useBarberAppointments, useBarberBlocks, useBlocksRange } from '../../hooks/useAppointments'
import { useBarbers } from '../../hooks/useTeam'
import { useAuth } from '../../contexts/AuthContext'
import { appointmentPaymentLabel, formatTime } from '../../lib/format'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { weekdayKeyFor } from '../../lib/schedule'
import type { AgendaBlock, Appointment, AppointmentStatus } from '../../types'
import { OwnerBookModal } from '../../components/OwnerBookModal'

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
  /** Bloqueio do dono que cobre este horário. */
  block?: AgendaBlock
  /** Cai na pausa de almoço (Configurações). */
  lunch?: boolean
}

function blockMinutes(b: AgendaBlock) {
  const d = b.date.toDate()
  return d.getHours() * 60 + d.getMinutes()
}

/** Monta a grade do dia (abertura → fechamento, de `step` em `step` minutos). */
function buildDay(
  open: number,
  close: number,
  step: number,
  appts: Appointment[],
  blocks: AgendaBlock[],
  lunch: { start: number; end: number } | null,
) {
  const active = appts.filter((a) => a.status !== 'canceled')
  const slots: Slot[] = []
  for (let t = open; t < close; t += step) {
    const starting = appts.filter((a) => minutesOf(a) >= t && minutesOf(a) < t + step)
    const continuing = active.find((a) => minutesOf(a) < t && minutesOf(a) + a.durationMinutes > t)
    const block = blocks.find((b) => blockMinutes(b) <= t && blockMinutes(b) + b.durationMinutes > t)
    const inLunch = !!lunch && t < lunch.end && t + step > lunch.start
    slots.push({ start: t, appointments: starting, continuing, block, lunch: inLunch })
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
  const { profile } = useAuth()
  /** Colaborador vê só a agenda dele; o dono escolhe de qual barbeiro (ou todos). */
  const barberMode = profile?.role === 'barber'
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const [booking, setBooking] = useState(false)
  const ownerAppts = useAppointmentsRange(day, endOfDay(day), !barberMode)
  const ownerBlocks = useBlocksRange(day, endOfDay(day), !barberMode)
  const myAppts = useBarberAppointments(barberMode ? profile?.uid : undefined)
  const myBlocks = useBarberBlocks(barberMode ? profile?.uid : undefined)
  const { data: barbers } = useBarbers(!barberMode)
  const [chosen, setChosen] = useState<string>('')
  const selected = barberMode ? profile!.uid : chosen || barbers[0]?.uid || 'all'
  const inDay = <T extends { date: { toDate: () => Date } }>(x: T) => {
    const d = x.date.toDate()
    return d >= day && d <= endOfDay(day)
  }
  const appointments = (barberMode ? myAppts.data.filter(inDay) : ownerAppts.data).filter(
    (a) => selected === 'all' || (a.barberId ?? barbers[0]?.uid ?? selected) === selected,
  )
  const blocks = (barberMode ? myBlocks.data.filter(inDay) : ownerBlocks.data).filter(
    (b) => selected === 'all' || !b.barberId || b.barberId === selected,
  )
  const loading = barberMode ? myAppts.loading : ownerAppts.loading
  const blockOwner = barberMode ? profile!.uid : selected === 'all' ? null : selected
  const selectedName = barbers.find((b) => b.uid === selected)?.name
  const [blocking, setBlocking] = useState<number | 'day' | null>(null)
  const { settings } = useBusinessSettings()
  const dayHours = settings.hours[weekdayKeyFor(day)]
  const isOpen = !!dayHours?.enabled
  const step = settings.slotDurationMinutes || 60
  const lunch =
    settings.lunch?.enabled && settings.lunch.start && settings.lunch.end
      ? { start: toMinutes(settings.lunch.start), end: toMinutes(settings.lunch.end) }
      : null
  const grid = isOpen
    ? buildDay(toMinutes(dayHours.open), toMinutes(dayHours.close), step, appointments, blocks, lunch)
    : { slots: [] as Slot[], outside: appointments }

  /** Bloqueia `minutes` minutos a partir de `start` (minutos do dia) — some para os clientes. */
  async function block(start: number, minutes: number, key: number | 'day') {
    setBlocking(key)
    try {
      const at = new Date(day)
      at.setHours(0, start, 0, 0)
      await addDoc(collection(db, 'agendaBlocks'), {
        date: Timestamp.fromDate(at),
        durationMinutes: minutes,
        reason: key === 'day' ? 'Dia fechado' : 'Bloqueado',
        // só da agenda deste barbeiro (null = barbearia toda)
        barberId: blockOwner,
        createdAt: Timestamp.now(),
      })
    } catch (err) {
      alert('Não foi possível bloquear. ' + (err as Error).message)
    } finally {
      setBlocking(null)
    }
  }
  async function unblock(b: AgendaBlock) {
    try {
      await deleteDoc(doc(db, 'agendaBlocks', b.id))
    } catch (err) {
      alert('Não foi possível desbloquear. ' + (err as Error).message)
    }
  }
  const dayFullyBlocked = isOpen && grid.slots.length > 0 && grid.slots.every((s) => s.block)

  async function changeStatus(id: string, status: AppointmentStatus, paymentMethod?: PayMethod) {
    try {
      await setAppointmentStatusFn({ appointmentId: id, status, ...(paymentMethod ? { paymentMethod } : {}) })
    } catch (err) {
      alert((err as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <OwnerBookModal
        open={booking}
        onClose={() => setBooking(false)}
        day={day}
        barberMode={barberMode}
        defaultBarberId={selected === 'all' ? '' : selected}
        barbers={barbers.map((b) => ({ id: b.uid, name: b.name }))}
        myAppointments={barberMode ? myAppts.data : undefined}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-neutral-100">{barberMode ? 'Minha agenda' : 'Agenda'}</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setBooking(true)} className="!px-3 !py-1.5 text-sm">
            + Marcar horário
          </Button>
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

      {!barberMode && barbers.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[...barbers.map((b) => ({ id: b.uid, name: b.name })), { id: 'all', name: 'Todos' }].map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setChosen(b.id)}
              className={`rounded-full border px-3 py-1 text-sm ${selected === b.id ? 'border-gold bg-gold/10 text-neutral-100' : 'border-ink-border text-neutral-400'}`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-neutral-400 first-letter:uppercase">
        {day.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        {!barberMode && selectedName && barbers.length > 1 ? ` · agenda de ${selectedName}` : ''}
      </p>

      {loading && <Spinner full />}

      {!loading && isOpen && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-neutral-500">
            Aberto das {dayHours.open} às {dayHours.close}
            {lunch ? ` · almoço ${settings.lunch!.start}–${settings.lunch!.end}` : ''}
          </p>
          {!dayFullyBlocked && (
            <Button
              variant="secondary"
              loading={blocking === 'day'}
              onClick={() => {
                if (
                  confirm(
                    blockOwner && (barberMode || barbers.length > 1)
                      ? `Folga de ${barberMode ? 'você' : selectedName} neste dia? Ninguém marca com ${barberMode ? 'você' : 'ele'}; os outros barbeiros continuam atendendo.`
                      : 'Bloquear o dia inteiro? Nenhum cliente vai conseguir marcar neste dia. Os horários já marcados continuam.',
                  )
                )
                  block(toMinutes(dayHours.open), toMinutes(dayHours.close) - toMinutes(dayHours.open), 'day')
              }}
              className="!px-2.5 !py-1 text-xs"
            >
              ⛔ {blockOwner && (barberMode || barbers.length > 1) ? 'Folga neste dia' : 'Bloquear o dia todo'}
            </Button>
          )}
        </div>
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
                  <AppointmentCard key={a.id} a={a} onChange={changeStatus} showBarber={selected === 'all'} />
                ))}
                {slot.appointments.every((a) => a.status === 'canceled') &&
                  (slot.continuing ? (
                    <div className="rounded-lg border border-dashed border-ink-border px-3 py-2.5 text-xs text-neutral-500">
                      Ocupado — continuação de {slot.continuing.clientName} ({formatTime(slot.continuing.date)})
                    </div>
                  ) : slot.block ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs text-red-300">
                      <span>⛔ {slot.block.reason === 'Dia fechado' ? 'Dia bloqueado' : slot.block.reason || 'Bloqueado'}</span>
                      {barberMode && slot.block.barberId !== profile?.uid ? (
                        <span className="text-red-300/70">barbearia fechada</span>
                      ) : slot.block.id.startsWith('holiday-') || slot.block.id.startsWith('closure-') ? (
                        <Link to="/owner/holidays" className="underline underline-offset-2">
                          ver em Feriados
                        </Link>
                      ) : (
                        <button type="button" onClick={() => unblock(slot.block!)} className="underline underline-offset-2">
                          desbloquear{slot.block.reason === 'Dia fechado' ? ' o dia' : ''}
                        </button>
                      )}
                    </div>
                  ) : slot.lunch ? (
                    <div className="rounded-lg border border-dashed border-ink-border px-3 py-2.5 text-xs text-neutral-500">
                      🍽 Almoço
                    </div>
                  ) : (
                    <div className="flex items-stretch gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBooking(true)}
                        className="flex-1 rounded-lg border border-dashed border-ink-border px-3 py-2.5 text-left text-xs text-emerald-400/80 hover:border-gold-dark"
                      >
                        Livre <span className="text-neutral-500">· toque para marcar</span>
                      </button>
                      <button
                        type="button"
                        disabled={blocking === slot.start}
                        onClick={() => block(slot.start, step, slot.start)}
                        title="Bloquear este horário para os clientes"
                        className="rounded-lg border border-dashed border-ink-border px-2.5 text-xs text-neutral-500 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
                      >
                        Bloquear
                      </button>
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
            <AppointmentCard key={a.id} a={a} onChange={changeStatus} showTime showBarber={selected === 'all'} />
          ))}
        </div>
      )}
    </div>
  )
}

type PayMethod = 'dinheiro' | 'pix' | 'cartao'
const PAY_LABEL: Record<PayMethod, string> = { dinheiro: '💵 Dinheiro', pix: 'Pix', cartao: '💳 Cartão' }

function AppointmentCard({
  a,
  onChange,
  showTime = false,
  showBarber = false,
}: {
  a: Appointment
  onChange: (id: string, status: AppointmentStatus, paymentMethod?: PayMethod) => void
  showTime?: boolean
  showBarber?: boolean
}) {
  // Avulso a pagar: ao concluir, pergunta como pagou (taxa da maquininha no relatório).
  const [askPay, setAskPay] = useState(false)
  const options = [
    ...(NEXT_STATUS[a.status] ?? []),
    ...(a.status === 'done' && a.autoCompleted ? [{ label: 'Não compareceu', to: 'no_show' as AppointmentStatus }] : []),
  ]
  return (
    <Card className={`flex flex-wrap items-center justify-between gap-3 !py-3 ${a.status === 'canceled' ? 'opacity-50' : ''}`}>
      <div className="flex min-w-0 items-center gap-3">
        {showTime && <p className="w-12 font-display text-sm text-gold-light">{formatTime(a.date)}</p>}
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-100">
            {a.clientName}
            {showBarber && a.barberName && <span className="ml-2 text-xs font-normal text-neutral-500">com {a.barberName}</span>}
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
        {a.status === 'done' && (
          <span className="text-[11px] text-neutral-500">
            {a.autoCompleted ? 'concluído sozinho' : a.paymentMethod ? PAY_LABEL[a.paymentMethod] : ''}
          </span>
        )}
        {askPay ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-neutral-400">Pagou como?</span>
            {(Object.keys(PAY_LABEL) as PayMethod[]).map((m) => (
              <Button
                key={m}
                variant="secondary"
                onClick={() => {
                  setAskPay(false)
                  onChange(a.id, 'done', m)
                }}
                className="!px-2.5 !py-1.5 text-xs"
              >
                {PAY_LABEL[m]}
              </Button>
            ))}
            <button type="button" onClick={() => setAskPay(false)} className="text-xs text-neutral-500 underline">
              voltar
            </button>
          </span>
        ) : (
          options.map((opt) => (
            <Button
              key={opt.to}
              variant={opt.to === 'canceled' ? 'danger' : 'secondary'}
              onClick={() => (opt.to === 'done' && a.price > 0 ? setAskPay(true) : onChange(a.id, opt.to))}
              className="!px-2.5 !py-1.5 text-xs"
            >
              {opt.label}
            </Button>
          ))
        )}
      </div>
    </Card>
  )
}
