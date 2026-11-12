import { useEffect, useMemo, useState } from 'react'
import {
  Timestamp,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useCollection } from '../../hooks/useCollection'
import { weekdayKeyFor } from '../../lib/schedule'
import { nationalHolidays } from '../../lib/holidayCalendar'

interface HolidayDoc {
  id: string
  date: Timestamp
  name: string
  key?: string | null
  closed: boolean
  notify?: boolean
  notifyDaysBefore?: number
  notifyAt?: Timestamp
  notifiedAt?: Timestamp
  notifiedCount?: number
  /** Fechamento de vários dias (férias): último dia. */
  endDate?: Timestamp
  /** Só parte do dia (ex.: médico das 14:00 às 18:00). */
  partial?: { start: string; end: string } | null
  /** Bloqueios criados na agenda para este fechamento. */
  blockIds?: string[]
}
interface Prefs {
  alwaysClosed?: string[]
  notifyDaysBefore?: number
}
interface Row {
  /** id do documento: AAAA-MM-DD (feriado/dia) ou c-… (fechamento do dono) */
  id: string
  ymd: string
  /** último dia (férias); igual a ymd quando é um dia só */
  endYmd: string
  name: string
  key: string | null
  partial?: { start: string; end: string } | null
  doc?: HolidayDoc
}

const REASONS = ['Férias', 'Consulta médica', 'Folga', 'Evento', 'Outro'] as const

function eachDay(startYmd: string, endYmd: string) {
  const out: string[] = []
  for (let d = parseYmd(startYmd); ymdLocal(d) <= endYmd && out.length < 62; d.setDate(d.getDate() + 1)) out.push(ymdLocal(d))
  return out
}
function toMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const DEFAULT_DAYS = 5
const PREFS = doc(db, 'ownerSettings', 'feriados')
const pad = (n: number) => String(n).padStart(2, '0')
const ymdLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function parseYmd(ymd: string, hour = 0) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, hour)
}
const brDay = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })

/** Feriados e dias fechados: fecha a agenda do dia e avisa os clientes no WhatsApp com antecedência. */
export function Holidays() {
  const { settings } = useBusinessSettings()
  const holidaysQuery = useMemo(() => query(collection(db, 'holidays')), [])
  const { data: docs } = useCollection<HolidayDoc>(holidaysQuery)
  const [prefs, setPrefs] = useState<Prefs>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [customDate, setCustomDate] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [reason, setReason] = useState<(typeof REASONS)[number]>('Férias')
  const [customName, setCustomName] = useState('')
  const [partOfDay, setPartOfDay] = useState(false)
  const [partStart, setPartStart] = useState('14:00')
  const [partEnd, setPartEnd] = useState('18:00')

  useEffect(() => onSnapshot(PREFS, (s) => setPrefs((s.data() as Prefs) ?? {}), () => setPrefs({})), [])

  const days = prefs.notifyDaysBefore ?? DEFAULT_DAYS
  const always = new Set(prefs.alwaysClosed ?? [])
  const today = ymdLocal(new Date())
  const inOneYear = ymdLocal(new Date(Date.now() + 365 * 86400000))

  // Calculado pro ano atual e o próximo: a lista anda sozinha com o tempo.
  const rows: Row[] = useMemo(() => {
    const year = new Date().getFullYear()
    const byYmd = new Map(docs.map((d) => [d.id, d]))
    const list: Row[] = [...nationalHolidays(year), ...nationalHolidays(year + 1)]
      .filter((h) => h.ymd >= today && h.ymd <= inOneYear)
      .map((h) => ({ id: h.ymd, ymd: h.ymd, endYmd: h.ymd, name: h.name, key: h.key, doc: byYmd.get(h.ymd) }))
    const national = new Set(list.map((r) => r.id))
    for (const d of docs) {
      if (national.has(d.id)) continue
      const ymd = ymdLocal(d.date.toDate())
      const endYmd = d.endDate ? ymdLocal(d.endDate.toDate()) : ymd
      if (endYmd < today || !d.closed) continue
      list.push({ id: d.id, ymd, endYmd, name: d.name, key: d.key ?? null, partial: d.partial ?? null, doc: d })
    }
    return list.sort((a, b) => a.ymd.localeCompare(b.ymd))
  }, [docs, today, inOneYear])

  async function close(r: Row) {
    const date = parseYmd(r.ymd)
    const next = parseYmd(r.endYmd)
    next.setDate(next.getDate() + 1)
    const appts = await getDocs(
      query(
        collection(db, 'appointments'),
        where('date', '>=', Timestamp.fromDate(date)),
        where('date', '<', Timestamp.fromDate(next)),
      ),
    )
    const active = appts.docs.filter((d) => ['scheduled', 'confirmed'].includes(d.data().status)).length
    const span =
      r.endYmd !== r.ymd
        ? `de ${brDay(date)} a ${brDay(parseYmd(r.endYmd))}`
        : `em ${brDay(date)}${r.partial ? `, das ${r.partial.start} às ${r.partial.end}` : ''}`
    const msg =
      `Fechar a barbearia ${span} (${r.name})?\n\n` +
      `• Nenhum cliente consegue marcar nesse dia.\n` +
      `• ${days} dias antes, os clientes cadastrados recebem no WhatsApp o aviso de que a barbearia vai fechar (sem dizer o motivo).` +
      (active > 0 ? `\n\n⚠️ Já tem ${active} horário(s) marcado(s) nesse dia. Eles continuam — cancele na Agenda se precisar (o cliente é avisado).` : '')
    if (!confirm(msg)) return
    setBusy(r.id)
    try {
      const batch = writeBatch(db)
      const notifyAt = parseYmd(r.ymd, 10)
      notifyAt.setDate(notifyAt.getDate() - days)
      // Bloqueio na agenda: um por dia (feriado nacional usa holiday-AAAA-MM-DD, como o servidor).
      const blockIds: string[] = []
      for (const ymd of eachDay(r.ymd, r.endYmd)) {
        const id = r.key || r.id === r.ymd && !r.partial ? `holiday-${ymd}` : `closure-${r.id}-${ymd}`
        const start = parseYmd(ymd)
        let minutes = 24 * 60
        if (r.partial) {
          start.setHours(0, toMin(r.partial.start), 0, 0)
          minutes = toMin(r.partial.end) - toMin(r.partial.start)
        }
        batch.set(doc(db, 'agendaBlocks', id), {
          date: Timestamp.fromDate(start),
          durationMinutes: minutes,
          reason: r.key ? `Feriado: ${r.name}` : r.name,
          createdAt: Timestamp.now(),
        })
        blockIds.push(id)
      }
      batch.set(doc(db, 'holidays', r.id), {
        date: Timestamp.fromDate(parseYmd(r.ymd, 12)),
        endDate: Timestamp.fromDate(parseYmd(r.endYmd, 12)),
        name: r.name,
        key: r.key,
        partial: r.partial ?? null,
        closed: true,
        notify: true,
        notifyDaysBefore: days,
        notifyAt: Timestamp.fromDate(notifyAt),
        blockIds,
        createdAt: Timestamp.now(),
      })
      await batch.commit()
    } catch (err) {
      alert('Não foi possível fechar. ' + (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function reopen(r: Row) {
    const warn = r.doc?.notifiedAt
      ? '\n\n⚠️ Os clientes já foram avisados que vai fechar. Se reabrir, avise eles que vai abrir.'
      : ''
    if (!confirm(`Reabrir ${brDay(parseYmd(r.ymd))} (${r.name})? Os horários voltam a aparecer para os clientes.${warn}`)) return
    setBusy(r.id)
    try {
      const batch = writeBatch(db)
      // fica salvo como "aberto" (assim o "todo ano" não fecha de novo este ano)
      batch.set(doc(db, 'holidays', r.id), { closed: false }, { merge: true })
      for (const id of r.doc?.blockIds ?? [`holiday-${r.ymd}`]) batch.delete(doc(db, 'agendaBlocks', id))
      await batch.commit()
    } finally {
      setBusy(null)
    }
  }

  async function toggleAlways(r: Row, on: boolean) {
    if (!r.key) return
    await setDoc(PREFS, { alwaysClosed: on ? arrayUnion(r.key) : arrayRemove(r.key) }, { merge: true })
    if (on && !r.doc?.closed) await close(r)
  }

  async function toggleNotify(r: Row, on: boolean) {
    if (!r.doc) return
    await setDoc(doc(db, 'holidays', r.id), { notify: on }, { merge: true })
  }

  async function changeDays(n: number) {
    await setDoc(PREFS, { notifyDaysBefore: n }, { merge: true })
    // reprograma os avisos que ainda não saíram
    const batch = writeBatch(db)
    for (const r of rows) {
      if (!r.doc?.closed || r.doc.notifiedAt) continue
      const at = parseYmd(r.ymd, 10)
      at.setDate(at.getDate() - n)
      batch.set(doc(db, 'holidays', r.id), { notifyDaysBefore: n, notifyAt: Timestamp.fromDate(at) }, { merge: true })
    }
    await batch.commit()
  }

  async function addCustom() {
    if (!customDate || customDate < today) return alert('Escolha uma data de hoje em diante.')
    const end = !partOfDay && customEnd && customEnd > customDate ? customEnd : customDate
    if (eachDay(customDate, end).length > 60) return alert('No máximo 60 dias de uma vez.')
    if (partOfDay && toMin(partEnd) <= toMin(partStart)) return alert('O horário final precisa ser depois do inicial.')
    const name = reason === 'Outro' ? customName.trim() || 'Barbearia fechada' : reason
    await close({
      id: `c-${customDate}-${Date.now().toString(36)}`,
      ymd: customDate,
      endYmd: end,
      name,
      key: null,
      partial: partOfDay ? { start: partStart, end: partEnd } : null,
    })
    setCustomDate('')
    setCustomEnd('')
    setCustomName('')
    setPartOfDay(false)
  }
  const hourOptions = Array.from({ length: 34 }, (_, i) => `${pad(6 + Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`)

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Feriados, folgas e férias</h1>

      <Card className="space-y-2 text-sm text-neutral-400">
        <p>
          Toque em <b>Fechar</b> nos dias em que a barbearia não abre (feriado, férias, médico, folga…). Os horários
          somem da agenda dos clientes e, com antecedência, todos os clientes cadastrados recebem no WhatsApp o aviso
          de que a barbearia vai estar fechada — <b>o motivo não aparece</b> para eles.
        </p>
        <label className="flex flex-wrap items-center gap-2">
          <span>Avisar os clientes</span>
          <select
            value={days}
            onChange={(e) => changeDays(Number(e.target.value))}
            className="rounded-md border border-ink-border bg-ink-soft px-2 py-1 text-sm text-neutral-100"
          >
            {[2, 3, 5, 7, 10, 15].map((n) => (
              <option key={n} value={n}>
                {n} dias
              </option>
            ))}
          </select>
          <span>antes do dia fechado.</span>
        </label>
      </Card>

      <div className="space-y-2">
        {rows.map((r) => {
          const date = parseYmd(r.ymd)
          const closed = !!r.doc?.closed
          const alreadyClosed = !r.doc && r.key !== null && !settings.hours[weekdayKeyFor(date)]?.enabled
          return (
            <Card key={r.id} className={`space-y-2 !py-3 ${closed ? 'border-red-500/40 bg-red-500/5' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-neutral-100">{r.name}</p>
                  <p className="text-xs capitalize text-neutral-500">
                    {brDay(date)}
                    {r.endYmd !== r.ymd ? ` até ${brDay(parseYmd(r.endYmd))}` : ''}
                    {r.partial ? ` · das ${r.partial.start} às ${r.partial.end}` : ''}
                  </p>
                </div>
                {alreadyClosed && !closed ? (
                  <span className="text-xs text-neutral-500">a barbearia já não abre nesse dia</span>
                ) : closed ? (
                  <Button variant="secondary" loading={busy === r.id} onClick={() => reopen(r)} className="!px-3 !py-1.5 text-xs">
                    Reabrir
                  </Button>
                ) : (
                  <Button loading={busy === r.id} onClick={() => close(r)} className="!px-3 !py-1.5 text-xs">
                    Fechar
                  </Button>
                )}
              </div>

              {closed && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="font-medium text-red-300">⛔ Fechado</span>
                  {r.doc?.notifiedAt ? (
                    <span className="text-emerald-400">
                      ✅ Aviso enviado para {r.doc.notifiedCount ?? 0} cliente(s) em{' '}
                      {r.doc.notifiedAt.toDate().toLocaleDateString('pt-BR')}
                    </span>
                  ) : (
                    <label className="flex items-center gap-1.5 text-neutral-400">
                      <input type="checkbox" checked={r.doc?.notify !== false} onChange={(e) => toggleNotify(r, e.target.checked)} />
                      Avisar clientes{r.doc?.notifyAt ? ` em ${r.doc.notifyAt.toDate().toLocaleDateString('pt-BR')}` : ''}
                    </label>
                  )}
                </div>
              )}

              {r.key && !alreadyClosed && (
                <label className="flex items-center gap-1.5 text-xs text-neutral-400">
                  <input type="checkbox" checked={always.has(r.key)} onChange={(e) => toggleAlways(r, e.target.checked)} />
                  Fechar todo ano (o sistema fecha e avisa sozinho nos próximos anos)
                </label>
              )}
            </Card>
          )
        })}
      </div>

      <Card className="space-y-3">
        <h2 className="font-display text-base text-gold-light">Fechar por outro motivo</h2>
        <p className="text-xs text-neutral-500">
          Férias, médico, folga, evento… O motivo fica só pra você; os clientes recebem apenas que a barbearia vai
          estar fechada.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`rounded-full border px-3 py-1 text-xs ${reason === r ? 'border-gold bg-gold/10 text-neutral-100' : 'border-ink-border text-neutral-400'}`}
            >
              {r}
            </button>
          ))}
        </div>
        {reason === 'Outro' && (
          <Input label="Motivo (só você vê)" placeholder="Ex.: Reforma" value={customName} onChange={(e) => setCustomName(e.target.value)} />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Input label={partOfDay ? 'Dia' : 'De'} type="date" min={today} value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
          {!partOfDay && (
            <Input
              label="Até (opcional)"
              type="date"
              min={customDate || today}
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={partOfDay} onChange={(e) => setPartOfDay(e.target.checked)} />
          Só uma parte do dia
        </label>
        {partOfDay && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-400">das</span>
            <select value={partStart} onChange={(e) => setPartStart(e.target.value)} className="rounded-md border border-ink-border bg-ink-soft px-2 py-1.5 text-neutral-100">
              {hourOptions.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <span className="text-neutral-400">às</span>
            <select value={partEnd} onChange={(e) => setPartEnd(e.target.value)} className="rounded-md border border-ink-border bg-ink-soft px-2 py-1.5 text-neutral-100">
              {hourOptions.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        )}
        <Button className="w-full" onClick={addCustom} disabled={!customDate}>
          Fechar e avisar os clientes
        </Button>
      </Card>
    </div>
  )
}
