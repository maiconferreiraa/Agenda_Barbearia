import { useEffect, useMemo, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useServices } from '../../hooks/useServices'
import { useAuth } from '../../contexts/AuthContext'
import { useClientSubscriptions } from '../../hooks/useSubscriptions'
import { formatCurrency } from '../../lib/format'
import { getAvailableSlotsFn, bookAppointmentFn } from '../../lib/bookingApi'
import type { ServiceItem } from '../../types'

function nextDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + i)
    return d
  })
}

export function Book() {
  const { profile } = useAuth()
  const { data: services, loading: loadingServices } = useServices({ onlyActive: true })
  const { data: subscriptions } = useClientSubscriptions(profile?.uid)
  const days = useMemo(() => nextDays(14), [])

  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null)
  const [selectedDay, setSelectedDay] = useState<Date>(days[0])
  const [slots, setSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [booking, setBooking] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<{ time: string; usedPlanCredit: boolean } | null>(null)
  const [error, setError] = useState('')

  const activeSub = subscriptions.find((s) => s.status === 'active')

  useEffect(() => {
    if (!selectedService) {
      setSlots([])
      return
    }
    setLoadingSlots(true)
    setError('')
    getAvailableSlotsFn({ serviceId: selectedService.id, dateISO: selectedDay.toISOString() })
      .then((res) => setSlots(res.data.slots))
      .catch(() => setError('Não foi possível carregar os horários. Tente novamente.'))
      .finally(() => setLoadingSlots(false))
  }, [selectedService, selectedDay])

  async function handleBook(timeISO: string) {
    if (!selectedService) return
    setBooking(timeISO)
    setError('')
    try {
      const res = await bookAppointmentFn({ serviceId: selectedService.id, dateISO: timeISO })
      setConfirmed({ time: timeISO, usedPlanCredit: res.data.usedPlanCredit })
      setSlots((prev) => prev.filter((s) => s !== timeISO))
    } catch (err) {
      setError((err as Error).message || 'Não foi possível agendar. Tente outro horário.')
    } finally {
      setBooking(null)
    }
  }

  if (confirmed) {
    return (
      <Card className="text-center">
        <p className="text-3xl">✂️</p>
        <h1 className="mt-2 font-display text-xl text-gold-light">Agendamento confirmado!</h1>
        <p className="mt-2 text-sm text-neutral-300">
          {selectedService?.name} em{' '}
          {new Date(confirmed.time).toLocaleString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
        {confirmed.usedPlanCredit ? (
          <p className="mt-1 text-xs text-emerald-400">Utilizado 1 crédito do seu plano.</p>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">Pagamento direto no balcão da barbearia.</p>
        )}
        <Button
          className="mt-4"
          onClick={() => {
            setConfirmed(null)
            setSelectedService(null)
          }}
        >
          Agendar outro horário
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-neutral-100">Agendar horário</h1>

      {activeSub && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 text-sm text-emerald-300">
          Você tem o plano <b>{activeSub.planName}</b> ativo. Créditos disponíveis serão usados
          automaticamente quando o serviço estiver incluso.
        </Card>
      )}

      <div>
        <p className="mb-2 text-xs font-medium text-neutral-400">1. Escolha o serviço</p>
        {loadingServices && <Spinner />}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelectedService(s)
                setConfirmed(null)
              }}
              className={`rounded-lg border p-3 text-left transition-colors ${
                selectedService?.id === s.id
                  ? 'border-gold bg-gold/10'
                  : 'border-ink-border bg-ink-card hover:border-gold-dark'
              }`}
            >
              <p className="text-sm font-medium text-neutral-100">{s.name}</p>
              <p className="text-xs text-neutral-500">
                {s.durationMinutes} min · {formatCurrency(s.price)}
              </p>
            </button>
          ))}
        </div>
      </div>

      {selectedService && (
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-400">2. Escolha o dia</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => {
              const active = d.toDateString() === selectedDay.toDateString()
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelectedDay(d)}
                  className={`flex shrink-0 flex-col items-center rounded-lg border px-3 py-2 ${
                    active ? 'border-gold bg-gold/10' : 'border-ink-border bg-ink-card'
                  }`}
                >
                  <span className="text-[10px] uppercase text-neutral-500">
                    {d.toLocaleDateString('pt-BR', { weekday: 'short' })}
                  </span>
                  <span className="text-sm font-medium text-neutral-100">{d.getDate()}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {selectedService && (
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-400">3. Escolha o horário</p>
          {loadingSlots && <Spinner />}
          {!loadingSlots && slots.length === 0 && (
            <p className="text-sm text-neutral-500">Sem horários livres neste dia.</p>
          )}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <Button
                key={s}
                variant="secondary"
                loading={booking === s}
                onClick={() => handleBook(s)}
                className="justify-center"
              >
                {new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </Button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
