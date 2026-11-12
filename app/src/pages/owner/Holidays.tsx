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
}
interface Prefs {
  alwaysClosed?: string[]
  notifyDaysBefore?: number
}
interface Row {
  ymd: string
  name: string
  key: string | null
  doc?: HolidayDoc
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
  const [customName, setCustomName] = useState('')

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
      .map((h) => ({ ymd: h.ymd, name: h.name, key: h.key, doc: byYmd.get(h.ymd) }))
    const national = new Set(list.map((r) => r.ymd))
    for (const d of docs) {
      if (!national.has(d.id) && d.id >= today) list.push({ ymd: d.id, name: d.name, key: d.key ?? null, doc: d })
    }
    return list.sort((a, b) => a.ymd.localeCompare(b.ymd))
  }, [docs, today, inOneYear])

  async function close(r: Row) {
    const date = parseYmd(r.ymd)
    const next = new Date(date)
    next.setDate(next.getDate() + 1)
    const appts = await getDocs(
      query(
        collection(db, 'appointments'),
        where('date', '>=', Timestamp.fromDate(date)),
        where('date', '<', Timestamp.fromDate(next)),
      ),
    )
    const active = appts.docs.filter((d) => ['scheduled', 'confirmed'].includes(d.data().status)).length
    const msg =
      `Fechar a barbearia em ${brDay(date)} (${r.name})?\n\n` +
      `• Nenhum cliente consegue marcar nesse dia.\n` +
      `• ${days} dias antes, os clientes cadastrados recebem o aviso no WhatsApp.` +
      (active > 0 ? `\n\n⚠️ Já tem ${active} horário(s) marcado(s) nesse dia. Eles continuam — cancele na Agenda se precisar (o cliente é avisado).` : '')
    if (!confirm(msg)) return
    setBusy(r.ymd)
    try {
      const batch = writeBatch(db)
      const notifyAt = parseYmd(r.ymd, 10)
      notifyAt.setDate(notifyAt.getDate() - days)
      batch.set(doc(db, 'holidays', r.ymd), {
        date: Timestamp.fromDate(parseYmd(r.ymd, 12)),
        name: r.name,
        key: r.key,
        closed: true,
        notify: true,
        notifyDaysBefore: days,
        notifyAt: Timestamp.fromDate(notifyAt),
        createdAt: Timestamp.now(),
      })
      batch.set(doc(db, 'agendaBlocks', `holiday-${r.ymd}`), {
        date: Timestamp.fromDate(date),
        durationMinutes: 24 * 60,
        reason: `Feriado: ${r.name}`,
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
    setBusy(r.ymd)
    try {
      const batch = writeBatch(db)
      // fica salvo como "aberto" (assim o "todo ano" não fecha de novo este ano)
      batch.set(doc(db, 'holidays', r.ymd), { closed: false }, { merge: true })
      batch.delete(doc(db, 'agendaBlocks', `holiday-${r.ymd}`))
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
    await setDoc(doc(db, 'holidays', r.ymd), { notify: on }, { merge: true })
  }

  async function changeDays(n: number) {
    await setDoc(PREFS, { notifyDaysBefore: n }, { merge: true })
    // reprograma os avisos que ainda não saíram
    const batch = writeBatch(db)
    for (const r of rows) {
      if (!r.doc?.closed || r.doc.notifiedAt) continue
      const at = parseYmd(r.ymd, 10)
      at.setDate(at.getDate() - n)
      batch.set(doc(db, 'holidays', r.ymd), { notifyDaysBefore: n, notifyAt: Timestamp.fromDate(at) }, { merge: true })
    }
    await batch.commit()
  }

  async function addCustom() {
    if (!customDate || customDate < today) return alert('Escolha uma data de hoje em diante.')
    await close({ ymd: customDate, name: customName.trim() || 'Barbearia fechada', key: null })
    setCustomDate('')
    setCustomName('')
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Feriados e dias fechados</h1>

      <Card className="space-y-2 text-sm text-neutral-400">
        <p>
          Toque em <b>Fechar</b> nos dias em que a barbearia não abre. O dia some da agenda dos clientes e, com
          antecedência, todos os clientes cadastrados recebem um aviso no WhatsApp para marcar antes.
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
          const alreadyClosed = !settings.hours[weekdayKeyFor(date)]?.enabled
          return (
            <Card key={r.ymd} className={`space-y-2 !py-3 ${closed ? 'border-red-500/40 bg-red-500/5' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-neutral-100">{r.name}</p>
                  <p className="text-xs capitalize text-neutral-500">{brDay(date)}</p>
                </div>
                {alreadyClosed && !closed ? (
                  <span className="text-xs text-neutral-500">a barbearia já não abre nesse dia</span>
                ) : closed ? (
                  <Button variant="secondary" loading={busy === r.ymd} onClick={() => reopen(r)} className="!px-3 !py-1.5 text-xs">
                    Reabrir
                  </Button>
                ) : (
                  <Button loading={busy === r.ymd} onClick={() => close(r)} className="!px-3 !py-1.5 text-xs">
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
        <h2 className="font-display text-base text-gold-light">Fechar outro dia</h2>
        <p className="text-xs text-neutral-500">Recesso, folga, feriado da cidade… Os clientes também são avisados.</p>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <Input label="Dia" type="date" min={today} value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
          <Input label="Motivo" placeholder="Ex.: Aniversário da cidade" value={customName} onChange={(e) => setCustomName(e.target.value)} />
          <Button onClick={addCustom} disabled={!customDate}>
            Fechar dia
          </Button>
        </div>
      </Card>
    </div>
  )
}
