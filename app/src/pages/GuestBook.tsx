import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../components/ThemeToggle'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { PhoneInput } from '../components/ui/PhoneInput'
import { Spinner } from '../components/ui/Spinner'
import { formatCurrency } from '../lib/format'
import { isValidPhone } from '../lib/phone'
import { guestBookAppointmentFn, publicServicesFn, publicSlotsFn, type PublicService } from '../lib/bookingApi'

const SAVED_KEY = 'agendar-sem-cadastro'

function nextDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + i)
    return d
  })
}

function loadSaved(): { name: string; phone: string } {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}')
    return { name: String(v.name ?? ''), phone: String(v.phone ?? '') }
  } catch {
    return { name: '', phone: '' }
  }
}

/** /agendar — o cliente marca só com nome e telefone, sem criar conta (avulso). */
export function GuestBook() {
  const saved = useMemo(loadSaved, [])
  const [name, setName] = useState(saved.name)
  const [phone, setPhone] = useState(saved.phone)
  const [services, setServices] = useState<PublicService[] | null>(null)
  const [picked, setPicked] = useState<PublicService[]>([])
  const days = useMemo(() => nextDays(14), [])
  const [day, setDay] = useState(days[0])
  const [slots, setSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ serviceName: string; price: number; dateISO: string } | null>(null)
  const [barbers, setBarbers] = useState<{ id: string; name: string }[]>([])
  const [barberId, setBarberId] = useState('')

  useEffect(() => {
    publicServicesFn({})
      .then((r) => {
        setServices(r.data.services)
        setBarbers(r.data.barbers ?? [])
      })
      .catch(() => setError('Não foi possível carregar os serviços. Tente de novo.'))
  }, [])

  const serviceIds = useMemo(() => picked.map((s) => s.id), [picked])
  const total = picked.reduce((s, x) => s + x.price, 0)
  const duration = picked.reduce((s, x) => s + x.durationMinutes, 0)
  const contactOk = name.trim().length >= 2 && isValidPhone(phone)

  useEffect(() => {
    if (serviceIds.length === 0) return setSlots([])
    setLoadingSlots(true)
    publicSlotsFn({ serviceIds, dateISO: day.toISOString(), barberId: barberId || 'any' })
      .then((r) => setSlots(r.data.slots))
      .catch(() => setError('Não foi possível carregar os horários.'))
      .finally(() => setLoadingSlots(false))
  }, [serviceIds, day, barberId])

  async function book(timeISO: string) {
    setSaving(timeISO)
    setError('')
    try {
      const r = await guestBookAppointmentFn({ name: name.trim(), phone, serviceIds, dateISO: timeISO, barberId: barberId || 'any' })
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify({ name: name.trim(), phone }))
      } catch {
        /* sem armazenamento: só não lembra da próxima vez */
      }
      setDone(r.data)
    } catch (err) {
      setError((err as Error).message || 'Não foi possível marcar. Tente outro horário.')
      setSlots((prev) => prev.filter((s) => s !== timeISO))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="relative min-h-screen bg-ink px-4 py-8">
      <ThemeToggle className="absolute right-3 top-3" />
      <div className="mx-auto w-full max-w-lg space-y-5">
        <div className="flex justify-center">
          <Logo size="lg" />
        </div>

        {done ? (
          <Card className="space-y-3 text-center">
            <p className="text-3xl">✂️</p>
            <h1 className="font-display text-xl text-gold-light">Horário marcado!</h1>
            <p className="text-sm text-neutral-300 first-letter:uppercase">
              {done.serviceName} —{' '}
              {new Date(done.dateISO).toLocaleString('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            <p className="text-xs text-neutral-500">
              Valor: {formatCurrency(done.price)}, pago na barbearia. A confirmação chega no seu WhatsApp.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Button variant="secondary" onClick={() => { setDone(null); setPicked([]) }}>
                Marcar outro
              </Button>
              <Link to="/register">
                <Button>Criar conta e ver planos</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <>
            <div className="text-center">
              <h1 className="font-display text-2xl text-neutral-100">Agendar sem cadastro</h1>
              <p className="mt-1 text-sm text-neutral-400">Só seu nome e telefone. Paga na barbearia.</p>
            </div>

            <Card className="space-y-3">
              <p className="text-xs font-medium text-neutral-400">1. Seus dados</p>
              <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" autoComplete="name" />
              <PhoneInput label="WhatsApp" value={phone} onChange={setPhone} />
            </Card>

            {contactOk && (
              <section className="space-y-2">
                <p className="text-xs font-medium text-neutral-400">2. Serviço — toque para marcar</p>
                {!services && <Spinner />}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {services?.map((s) => {
                    const on = picked.some((p) => p.id === s.id)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setPicked((prev) => (on ? prev.filter((p) => p.id !== s.id) : [...prev, s]))}
                        className={`rounded-lg border p-3 text-left transition-colors ${on ? 'border-gold bg-gold/10' : 'border-ink-border bg-ink-card hover:border-gold-dark'}`}
                      >
                        <p className="text-sm font-medium text-neutral-100">{s.name}</p>
                        <p className="text-xs text-neutral-500">
                          {s.durationMinutes} min · {formatCurrency(s.price)}
                        </p>
                      </button>
                    )
                  })}
                </div>
                {picked.length > 0 && (
                  <p className="text-xs text-neutral-400">
                    {duration} min · {formatCurrency(total)}
                  </p>
                )}
              </section>
            )}

{contactOk && picked.length > 0 && barbers.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-400">Com qual barbeiro?</p>
          <div className="flex flex-wrap gap-1.5">
            {[...barbers, { id: '', name: 'Sem preferência' }].map((b) => (
              <button
                key={b.id || 'any'}
                type="button"
                onClick={() => setBarberId(b.id)}
                className={`rounded-full border px-3 py-1.5 text-sm ${barberId === b.id ? 'border-gold bg-gold/10 text-neutral-100' : 'border-ink-border bg-ink-card text-neutral-400'}`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

            {contactOk && picked.length > 0 && (
              <section className="space-y-2">
                <p className="text-xs font-medium text-neutral-400">3. Dia e horário</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {days.map((d) => {
                    const on = d.toDateString() === day.toDateString()
                    return (
                      <button
                        key={d.toISOString()}
                        type="button"
                        onClick={() => setDay(d)}
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

            <p className="text-center text-sm text-neutral-500">
              Tem plano ou quer assinar?{' '}
              <Link to="/login" className="text-gold-light underline underline-offset-2">
                Entrar
              </Link>{' '}
              ou{' '}
              <Link to="/register" className="text-gold-light underline underline-offset-2">
                criar conta
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
