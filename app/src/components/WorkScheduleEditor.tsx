import { Fragment, useEffect, useMemo, useState } from 'react'
import { Timestamp, collection, deleteDoc, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { useBusinessSettings } from '../hooks/useBusinessSettings'
import { useBarberAppointments, useBarberBlocks } from '../hooks/useAppointments'
import { WEEKDAY_LABELS, scheduleOf } from '../lib/schedule'
import { nationalHolidays } from '../lib/holidayCalendar'
import { setWorkScheduleFn } from '../lib/paymentsApi'
import type { AgendaBlock, BusinessSettings, DayHours, UserProfile, WorkSchedule } from '../types'

type DayKey = keyof BusinessSettings['hours']
const DAY_MIN = 24 * 60
const REASONS = ['Folga', 'Férias', 'Consulta médica', 'Outro'] as const

const pad = (n: number) => String(n).padStart(2, '0')
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function eachDay(from: string, to: string) {
  const out: string[] = []
  for (let d = parseYmd(from); ymdOf(d) <= to && out.length < 62; d.setDate(d.getDate() + 1)) out.push(ymdOf(d))
  return out
}
const brDay = (ymd: string) =>
  parseYmd(ymd).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })

/** Horários em 24 h de 30 em 30 min (mantém um valor salvo fora dessa grade). */
function timeOptions(current: string) {
  const list: string[] = []
  for (let m = 5 * 60; m <= 23 * 60 + 30; m += 30) list.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`)
  if (current && !list.includes(current)) list.push(current)
  return list.sort()
}

const selectCls =
  'w-full min-w-0 rounded-md border border-ink-border bg-ink-soft px-1.5 py-1.5 text-sm text-neutral-100 disabled:opacity-40'

/**
 * Dias e horários de quem atende: semana, almoço, folgas/férias e feriados.
 * Tudo vale só para a agenda desta pessoa. O barbeiro mexe na dele; o dono, na de qualquer um.
 */
export function WorkScheduleEditor({ member, self }: { member: UserProfile; self: boolean }) {
  const { settings, loading } = useBusinessSettings()
  const current = scheduleOf(settings, member)
  const [custom, setCustom] = useState(current.own)
  const [form, setForm] = useState<WorkSchedule>({ hours: current.hours, lunch: current.lunch })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const you = self ? 'você' : member.name.split(' ')[0]

  useEffect(() => {
    if (loading) return
    const s = scheduleOf(settings, member)
    setCustom(s.own)
    setForm({ hours: s.hours, lunch: s.lunch ?? { enabled: false, start: '12:00', end: '13:00' } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, member.uid])

  function updateDay(key: DayKey, patch: Partial<DayHours>) {
    setSaved(false)
    setForm((f) => ({ ...f, hours: { ...f.hours, [key]: { ...f.hours[key], ...patch } } }))
  }

  async function save() {
    setSaving(true)
    try {
      await setWorkScheduleFn({ id: member.uid, schedule: custom ? form : null })
      setSaved(true)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-display text-base text-gold-light">Dias e horário de trabalho</h2>
        <div className="flex flex-col gap-1.5 text-sm text-neutral-300">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={!custom}
              onChange={() => {
                setCustom(false)
                setSaved(false)
                setForm({ hours: settings.hours, lunch: settings.lunch })
              }}
            />
            Igual ao horário da barbearia
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={custom}
              onChange={() => {
                setCustom(true)
                setSaved(false)
              }}
            />
            Horário próprio de {you}
          </label>
        </div>

        {(Object.keys(WEEKDAY_LABELS) as DayKey[]).map((key) => {
          const day = form.hours[key]
          if (!day) return null
          return (
            <div key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  disabled={!custom}
                  checked={day.enabled}
                  onChange={(e) => updateDay(key, { enabled: e.target.checked })}
                />
                {WEEKDAY_LABELS[key]}
              </label>
              <select value={day.open} disabled={!custom || !day.enabled} onChange={(e) => updateDay(key, { open: e.target.value })} className={selectCls}>
                {timeOptions(day.open).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <span className="text-neutral-500">até</span>
              <select value={day.close} disabled={!custom || !day.enabled} onChange={(e) => updateDay(key, { close: e.target.value })} className={selectCls}>
                {timeOptions(day.close).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )
        })}

        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-t border-ink-border pt-3">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              disabled={!custom}
              checked={!!form.lunch?.enabled}
              onChange={(e) => {
                setSaved(false)
                setForm((f) => ({ ...f, lunch: { start: '12:00', end: '13:00', ...f.lunch, enabled: e.target.checked } }))
              }}
            />
            Almoço
          </label>
          {(['start', 'end'] as const).map((k, i) => (
            <Fragment key={k}>
              {i === 1 && <span className="text-neutral-500">até</span>}
              <select
                value={form.lunch?.[k] ?? (k === 'start' ? '12:00' : '13:00')}
                disabled={!custom || !form.lunch?.enabled}
                onChange={(e) => {
                  setSaved(false)
                  setForm((f) => ({ ...f, lunch: { enabled: true, start: '12:00', end: '13:00', ...f.lunch, [k]: e.target.value } }))
                }}
                className={selectCls}
              >
                {timeOptions(form.lunch?.[k] ?? '').map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Fragment>
          ))}
        </div>
        <p className="text-xs text-neutral-500">
          Os clientes só veem horário livre com {you} dentro desses dias e horas, fora do almoço. Pela agenda dá para
          encaixar alguém fora do horário.
        </p>
        <Button className="w-full" loading={saving} onClick={save}>
          {saved ? 'Salvo ✓' : 'Salvar horário'}
        </Button>
      </Card>

      <DaysOff member={member} you={you} />
    </div>
  )
}

/** Folgas, férias e feriados: bloqueia o dia inteiro só na agenda desta pessoa. */
function DaysOff({ member, you }: { member: UserProfile; you: string }) {
  const blocks = useBarberBlocks(member.uid)
  const appts = useBarberAppointments(member.uid)
  const today = ymdOf(new Date())
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState<(typeof REASONS)[number]>('Folga')
  const [busy, setBusy] = useState<string | null>(null)

  /** dias (AAAA-MM-DD) com bloqueio do dia inteiro: só desta pessoa / da barbearia toda */
  const { mine, shop } = useMemo(() => {
    const mine = new Map<string, AgendaBlock[]>()
    const shop = new Map<string, string>()
    for (const b of blocks.data) {
      if (b.durationMinutes < DAY_MIN && b.reason !== 'Dia fechado') continue
      const ymd = ymdOf(b.date.toDate())
      if (ymd < today) continue
      if (b.barberId === member.uid) mine.set(ymd, [...(mine.get(ymd) ?? []), b])
      else if (!b.barberId) shop.set(ymd, b.reason ?? 'Barbearia fechada')
    }
    return { mine, shop }
  }, [blocks.data, member.uid, today])

  const holidays = useMemo(() => {
    const y = new Date().getFullYear()
    const limit = ymdOf(new Date(Date.now() + 365 * 86400000))
    return [...nationalHolidays(y), ...nationalHolidays(y + 1)].filter((h) => h.ymd >= today && h.ymd <= limit)
  }, [today])

  /** Fecha os dias na agenda desta pessoa (avisa antes se já tem cliente marcado). */
  async function closeDays(days: string[], why: string, key: string) {
    const todo = days.filter((d) => d >= today && !mine.has(d) && !shop.has(d))
    if (todo.length === 0) return alert('Esses dias já estão fechados.')
    const set = new Set(todo)
    const booked = appts.data.filter((a) => a.status !== 'canceled' && a.status !== 'done' && set.has(ymdOf(a.date.toDate())))
    if (booked.length > 0) {
      const list = booked
        .slice(0, 8)
        .map((a) => `• ${a.date.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} ${a.clientName}`)
        .join('\n')
      const ok = confirm(
        `Já tem ${booked.length} cliente(s) marcado(s) com ${you} nesses dias:\n${list}\n\nOs horários continuam marcados — remarque ou desmarque pela agenda. Fechar mesmo assim?`,
      )
      if (!ok) return
    }
    setBusy(key)
    try {
      const batch = writeBatch(db)
      for (const ymd of todo) {
        batch.set(doc(collection(db, 'agendaBlocks')), {
          date: Timestamp.fromDate(parseYmd(ymd)),
          durationMinutes: DAY_MIN,
          reason: why,
          barberId: member.uid,
          createdAt: Timestamp.now(),
        })
      }
      await batch.commit()
      setFrom('')
      setTo('')
    } catch (err) {
      alert('Não foi possível fechar. ' + (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function reopen(ymd: string) {
    setBusy(ymd)
    try {
      await Promise.all((mine.get(ymd) ?? []).map((b) => deleteDoc(doc(db, 'agendaBlocks', b.id))))
    } catch (err) {
      alert('Não foi possível reabrir. ' + (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const holidaySet = new Set(holidays.map((h) => h.ymd))
  const offDays = [...mine.entries()].filter(([ymd]) => !holidaySet.has(ymd)).sort(([a], [b]) => a.localeCompare(b))

  return (
    <>
      <Card className="space-y-3">
        <h2 className="font-display text-base text-gold-light">Folga e férias</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-neutral-400">
            De
            <input type="date" min={today} value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls} />
          </label>
          <label className="text-xs text-neutral-400">
            Até (opcional)
            <input type="date" min={from || today} value={to} onChange={(e) => setTo(e.target.value)} className={selectCls} />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`rounded-full border px-3 py-1 text-sm ${reason === r ? 'border-gold bg-gold/10 text-neutral-100' : 'border-ink-border text-neutral-400'}`}
            >
              {r}
            </button>
          ))}
        </div>
        <Button
          className="w-full"
          disabled={!from || (!!to && to < from)}
          loading={busy === 'range'}
          onClick={() => closeDays(eachDay(from, to || from), reason, 'range')}
        >
          Fechar a agenda de {you} nesses dias
        </Button>
        {offDays.length > 0 && (
          <ul className="divide-y divide-ink-border text-sm">
            {offDays.map(([ymd, list]) => (
              <li key={ymd} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-neutral-300">
                  {brDay(ymd)} · <span className="text-neutral-500">{list[0].reason ?? 'Folga'}</span>
                </span>
                <Button variant="secondary" loading={busy === ymd} onClick={() => reopen(ymd)} className="!px-2.5 !py-1 text-xs">
                  Reabrir
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-neutral-500">Fecha só a agenda de {you}. Os outros barbeiros continuam atendendo.</p>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-display text-base text-gold-light">Feriados</h2>
        <ul className="divide-y divide-ink-border text-sm">
          {holidays.map((h) => {
            const closedShop = shop.get(h.ymd)
            const off = mine.has(h.ymd)
            return (
              <li key={h.ymd} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 text-neutral-300">
                  {brDay(h.ymd)} · {h.name}
                  <span className={`block text-xs ${closedShop || off ? 'text-red-400' : 'text-emerald-400'}`}>
                    {closedShop ? 'Barbearia fechada' : off ? `${you === 'você' ? 'Você não vai' : `${you} não vai`} atender` : 'Atendendo normal'}
                  </span>
                </span>
                {!closedShop &&
                  (off ? (
                    <Button variant="secondary" loading={busy === h.ymd} onClick={() => reopen(h.ymd)} className="!px-2.5 !py-1 text-xs">
                      Vou atender
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      loading={busy === h.ymd}
                      onClick={() => closeDays([h.ymd], `Feriado: ${h.name}`, h.ymd)}
                      className="!px-2.5 !py-1 text-xs"
                    >
                      Não vou atender
                    </Button>
                  ))}
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-neutral-500">
          "Barbearia fechada" é decidido pelo dono em Folgas e feriados (fecha para todos e avisa os clientes).
        </p>
      </Card>
    </>
  )
}
