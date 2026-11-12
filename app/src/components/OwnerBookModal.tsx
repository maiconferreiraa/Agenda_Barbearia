import { useEffect, useMemo, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input } from './ui/Field'
import { Spinner } from './ui/Spinner'
import { PhoneInput } from './ui/PhoneInput'
import { isValidPhone } from '../lib/phone'
import { useClients } from '../hooks/useClients'
import { useServices } from '../hooks/useServices'
import { usePlans } from '../hooks/usePlans'
import { useAllSubscriptions } from '../hooks/useSubscriptions'
import { formatCurrency } from '../lib/format'
import { getAvailableSlotsFn, ownerBookAppointmentFn } from '../lib/bookingApi'
import type { Appointment, ServiceItem, UserProfile } from '../types'

type PayMode = 'plan' | 'walk_in'

function nextDays(from: Date, n: number) {
  const base = new Date(from)
  base.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = base < today ? today : base
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
}

const chip = (on: boolean) =>
  `rounded-lg border p-3 text-left transition-colors ${on ? 'border-gold bg-gold/10' : 'border-ink-border bg-ink-card hover:border-gold-dark'}`

/** Agenda → "+ Marcar horário": o dono marca pelo cliente, com crédito do plano ou avulso. */
export function OwnerBookModal({
  open,
  onClose,
  day,
  barberMode = false,
  defaultBarberId = '',
  barbers = [],
  myAppointments,
}: {
  open: boolean
  onClose: () => void
  day: Date
  /** colaborador: marca na própria agenda; clientes = os da agenda dele */
  barberMode?: boolean
  defaultBarberId?: string
  barbers?: { id: string; name: string }[]
  myAppointments?: Appointment[]
}) {
  const { data: allClients } = useClients(!barberMode)
  const { data: services } = useServices({ onlyActive: true })
  const { data: plans } = usePlans()
  const { data: subscriptions } = useAllSubscriptions(!barberMode)
  // colaborador não lê a lista geral: usa os clientes que já passaram pela agenda dele
  const clients: UserProfile[] = useMemo(() => {
    if (!barberMode) return allClients
    const seen = new Map<string, UserProfile>()
    for (const a of myAppointments ?? []) {
      const key = a.clientId || a.clientPhone || a.clientName
      if (!seen.has(key)) {
        seen.set(key, { uid: a.clientId || `guest:${a.clientPhone ?? a.clientName}`, name: a.clientName, phone: a.clientPhone ?? '', email: '', role: 'client' })
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [barberMode, allClients, myAppointments])
  const [barberId, setBarberId] = useState(defaultBarberId)

  const [search, setSearch] = useState('')
  const [clientId, setClientId] = useState<string | null>(null)
  const [newClient, setNewClient] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [picked, setPicked] = useState<ServiceItem[]>([])
  const [payMode, setPayMode] = useState<PayMode>('walk_in')
  const days = useMemo(() => nextDays(day, 14), [day])
  const [selectedDay, setSelectedDay] = useState<Date>(days[0])
  const [slots, setSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  // Abre sempre limpo, no dia que está na agenda.
  useEffect(() => {
    if (!open) return
    setBarberId(defaultBarberId)
    setSearch('')
    setClientId(null)
    setNewClient(false)
    setGuestName('')
    setGuestPhone('')
    setPicked([])
    setPayMode('walk_in')
    setSelectedDay(days[0])
    setError('')
    setDone('')
  }, [open, days])

  const client = clients.find((c) => c.uid === clientId) ?? null
  const sub = client
    ? subscriptions.find((s) => s.clientId === client.uid && s.status === 'active')
    : undefined
  const plan = sub ? plans.find((p) => p.id === sub.planId) : undefined
  const credits = (plan?.includedServices ?? []).map((i) => ({
    ...i,
    left: Math.max(0, i.quantity - (sub?.usage?.[i.serviceId] ?? 0)),
  }))
  const coveredByPlan = picked.some((s) => credits.some((c) => c.serviceId === s.id && c.left > 0))

  // Plano é a escolha natural quando o cliente tem crédito pro que foi escolhido.
  useEffect(() => {
    setPayMode(coveredByPlan ? 'plan' : 'walk_in')
  }, [coveredByPlan, clientId])

  const serviceIds = useMemo(() => picked.map((s) => s.id), [picked])
  const duration = picked.reduce((s, x) => s + x.durationMinutes, 0)
  const walkInTotal = picked
    .filter((s) => payMode === 'walk_in' || !credits.some((c) => c.serviceId === s.id && c.left > 0))
    .reduce((s, x) => s + x.price, 0)

  useEffect(() => {
    if (!open || serviceIds.length === 0) {
      setSlots([])
      return
    }
    setLoadingSlots(true)
    getAvailableSlotsFn({ serviceIds, dateISO: selectedDay.toISOString(), ...(barberMode ? {} : { barberId: barberId || 'any' }) })
      .then((r) => setSlots(r.data.slots))
      .catch(() => setError('Não foi possível carregar os horários.'))
      .finally(() => setLoadingSlots(false))
  }, [open, serviceIds, selectedDay, barberId, barberMode])

  const filtered = clients
    .filter((c) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return [c.name, c.phone, c.email].some((v) => v?.toLowerCase().includes(q))
    })
    .slice(0, 6)

  const who = client?.name ?? (newClient ? guestName.trim() : '')
  const phoneOk = !newClient || !guestPhone || isValidPhone(guestPhone)
  const ready = !!who && picked.length > 0 && phoneOk

  async function book(timeISO: string) {
    setSaving(timeISO)
    setError('')
    try {
      const guestFromList = client && client.uid.startsWith('guest:')
      const res = await ownerBookAppointmentFn({
        ...(client && !guestFromList
          ? { clientId: client.uid }
          : client
            ? { clientName: client.name, clientPhone: client.phone || undefined }
            : { clientName: guestName.trim(), clientPhone: guestPhone.trim() }),
        serviceIds,
        dateISO: timeISO,
        payMode: barberMode ? 'auto' : payMode,
        ...(barberMode ? {} : { barberId: barberId || 'any' }),
      })
      const t = new Date(timeISO).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      setDone(`${who} — ${picked.map((s) => s.name).join(' + ')}, ${t}${res.data.usedPlanCredit ? ' (crédito do plano)' : ''}.`)
    } catch (err) {
      setError((err as Error).message || 'Não foi possível marcar.')
    } finally {
      setSaving(null)
    }
  }

  if (done) {
    return (
      <Modal open={open} onClose={onClose} title="Horário marcado">
        <div className="space-y-4 text-center">
          <p className="text-3xl">✂️</p>
          <p className="text-sm text-neutral-300 first-letter:uppercase">{done}</p>
          <p className="text-xs text-neutral-500">O cliente recebe o aviso no app e no WhatsApp (se tiver número).</p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => setDone('')}>Marcar outro</Button>
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Marcar horário">
      <div className="space-y-5">
        {/* 1. Cliente */}
        <section className="space-y-2">
          <p className="text-xs font-medium text-neutral-400">1. Cliente</p>
          {client ? (
            <div className="flex items-center justify-between rounded-lg border border-gold bg-gold/10 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-neutral-100">{client.name}</p>
                <p className="text-xs text-neutral-500">
                  {sub ? `Plano ${sub.planName}` : 'Sem plano ativo'}
                  {client.phone ? ` · ${client.phone}` : ''}
                </p>
              </div>
              <button type="button" className="text-xs text-neutral-400 underline" onClick={() => setClientId(null)}>
                trocar
              </button>
            </div>
          ) : newClient ? (
            <div className="space-y-2">
              <Input label="Nome" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Nome do cliente" />
              <PhoneInput
                label="WhatsApp (opcional — recebe a confirmação)"
                value={guestPhone}
                onChange={setGuestPhone}
              />
              <button type="button" className="text-xs text-neutral-400 underline" onClick={() => setNewClient(false)}>
                ← escolher um cliente cadastrado
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input placeholder="Buscar por nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="space-y-1">
                {filtered.map((c) => {
                  const s = subscriptions.find((x) => x.clientId === c.uid && x.status === 'active')
                  return (
                    <button
                      key={c.uid}
                      type="button"
                      onClick={() => setClientId(c.uid)}
                      className="flex w-full items-center justify-between rounded-lg border border-ink-border bg-ink-card px-3 py-2 text-left hover:border-gold-dark"
                    >
                      <span className="text-sm text-neutral-100">{c.name}</span>
                      <span className="text-xs text-neutral-500">{s ? s.planName : 'sem plano'}</span>
                    </button>
                  )
                })}
                {filtered.length === 0 && <p className="text-xs text-neutral-500">Nenhum cliente encontrado.</p>}
              </div>
              <button type="button" className="text-sm text-gold-light underline underline-offset-2" onClick={() => setNewClient(true)}>
                + Cliente sem cadastro (só nome e telefone)
              </button>
            </div>
          )}
        </section>

        {/* 2. Serviços */}
        {who && (
          <section className="space-y-2">
            <p className="text-xs font-medium text-neutral-400">2. Serviços</p>
            <div className="grid grid-cols-2 gap-2">
              {services.map((s) => {
                const on = picked.some((p) => p.id === s.id)
                const credit = credits.find((c) => c.serviceId === s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={chip(on)}
                    onClick={() => setPicked((prev) => (on ? prev.filter((p) => p.id !== s.id) : [...prev, s]))}
                  >
                    <p className="text-sm font-medium text-neutral-100">{s.name}</p>
                    <p className="text-xs text-neutral-500">
                      {s.durationMinutes} min · {formatCurrency(s.price)}
                    </p>
                    {credit && (
                      <p className={`text-xs ${credit.left > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        Plano: {credit.left} de {credit.quantity} restante{credit.quantity > 1 ? 's' : ''}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Barbeiro (dono, quando há mais de um) */}
        {ready && !barberMode && barbers.length > 1 && (
          <section className="space-y-2">
            <p className="text-xs font-medium text-neutral-400">Com qual barbeiro</p>
            <div className="flex flex-wrap gap-1.5">
              {[...barbers, { id: '', name: 'Sem preferência' }].map((b) => (
                <button
                  key={b.id || 'any'}
                  type="button"
                  onClick={() => setBarberId(b.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${barberId === b.id ? 'border-gold bg-gold/10 text-neutral-100' : 'border-ink-border text-neutral-400'}`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {ready && barberMode && (
          <p className="text-xs text-neutral-500">Marca na sua agenda. Se o cliente tiver plano, o crédito é usado sozinho.</p>
        )}

        {/* 3. Plano ou avulso */}
        {ready && !barberMode && (
          <section className="space-y-2">
            <p className="text-xs font-medium text-neutral-400">3. Como vai ser pago</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!coveredByPlan}
                className={`${chip(payMode === 'plan')} disabled:cursor-not-allowed disabled:opacity-40`}
                onClick={() => setPayMode('plan')}
              >
                <p className="text-sm font-medium text-neutral-100">Crédito do plano</p>
                <p className="text-xs text-neutral-500">{coveredByPlan ? 'Desconta do plano' : client ? 'Sem crédito pra isso' : 'Sem plano'}</p>
              </button>
              <button type="button" className={chip(payMode === 'walk_in')} onClick={() => setPayMode('walk_in')}>
                <p className="text-sm font-medium text-neutral-100">Avulso</p>
                <p className="text-xs text-neutral-500">Paga no balcão</p>
              </button>
            </div>
            <p className="text-xs text-neutral-400">
              {duration} min · {walkInTotal > 0 ? `${formatCurrency(walkInTotal)} a pagar no balcão` : 'nada a pagar'}
            </p>
          </section>
        )}

        {/* 4. Dia e horário */}
        {ready && (
          <section className="space-y-2">
            <p className="text-xs font-medium text-neutral-400">4. Dia e horário</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((d) => {
                const on = d.toDateString() === selectedDay.toDateString()
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => setSelectedDay(d)}
                    className={`flex shrink-0 flex-col items-center rounded-lg border px-3 py-2 ${on ? 'border-gold bg-gold/10' : 'border-ink-border bg-ink-card'}`}
                  >
                    <span className="text-[10px] uppercase text-neutral-500">
                      {d.toLocaleDateString('pt-BR', { weekday: 'short' })}
                    </span>
                    <span className="text-sm font-medium text-neutral-100">{d.getDate()}</span>
                  </button>
                )
              })}
            </div>
            {loadingSlots && <Spinner />}
            {!loadingSlots && slots.length === 0 && <p className="text-sm text-neutral-500">Sem horários livres neste dia.</p>}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((s) => (
                <Button key={s} variant="secondary" loading={saving === s} disabled={!!saving} onClick={() => book(s)}>
                  {new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Button>
              ))}
            </div>
            {slots.length > 0 && <p className="text-xs text-neutral-500">Toque no horário para marcar.</p>}
          </section>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}
