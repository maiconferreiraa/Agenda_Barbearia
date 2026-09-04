import { Card } from '../../components/ui/Card'
import { Spinner } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/StatusBadge'
import { useClients } from '../../hooks/useClients'
import { useAllSubscriptions } from '../../hooks/useSubscriptions'
import { initials } from '../../lib/format'

export function Clients() {
  const { data: clients, loading } = useClients()
  const { data: subscriptions } = useAllSubscriptions()

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Clientes</h1>

      {loading && <Spinner full />}

      {!loading && clients.length === 0 && (
        <Card className="text-center text-sm text-neutral-400">Nenhum cliente cadastrado ainda.</Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((c) => {
          const activeSub = subscriptions.find(
            (s) => s.clientId === c.uid && (s.status === 'active' || s.status === 'past_due'),
          )
          return (
            <Card key={c.uid} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-medium text-gold-light">
                {initials(c.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-100">{c.name}</p>
                <p className="truncate text-xs text-neutral-500">{c.phone || c.email}</p>
              </div>
              {activeSub ? (
                <StatusBadge status={activeSub.status} />
              ) : (
                <span className="text-xs text-neutral-600">sem plano</span>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
