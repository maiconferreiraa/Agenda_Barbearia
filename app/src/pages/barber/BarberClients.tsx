import { Card } from '../../components/ui/Card'
import { Spinner } from '../../components/ui/Spinner'
import { useAuth } from '../../contexts/AuthContext'
import { useBarberAppointments } from '../../hooks/useAppointments'
import { initials } from '../../lib/format'

/** Colaborador: os clientes que já marcaram com ele (tirado da agenda dele). */
export function BarberClients() {
  const { profile } = useAuth()
  const { data: appts, loading } = useBarberAppointments(profile?.uid)
  const byClient = new Map<string, { name: string; phone: string | null; visits: number; last: Date | null; next: Date | null }>()
  const now = Date.now()
  for (const a of appts) {
    const key = a.clientPhone || a.clientId || a.clientName
    const row = byClient.get(key) ?? { name: a.clientName, phone: a.clientPhone ?? null, visits: 0, last: null, next: null }
    const when = a.date.toDate()
    if (a.status === 'done') {
      row.visits++
      if (!row.last || when > row.last) row.last = when
    }
    if (['scheduled', 'confirmed'].includes(a.status) && when.getTime() > now && (!row.next || when < row.next)) row.next = when
    byClient.set(key, row)
  }
  const list = [...byClient.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const br = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Meus clientes</h1>
      {loading && <Spinner full />}
      {!loading && list.length === 0 && (
        <Card className="text-center text-sm text-neutral-400">Ainda não tem clientes na sua agenda.</Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <Card key={c.phone ?? c.name} className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-medium text-gold-light">
              {initials(c.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-100">{c.name}</p>
              <p className="truncate text-xs text-neutral-500">{c.phone ?? 'sem telefone'}</p>
              <p className="text-xs text-neutral-500">
                {c.visits} atendimento(s){c.last ? ` · último ${br(c.last)}` : ''}
                {c.next ? ` · próximo ${br(c.next)}` : ''}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
