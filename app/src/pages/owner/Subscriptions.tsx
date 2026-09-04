import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { Spinner } from '../../components/ui/Spinner'
import { useAllSubscriptions } from '../../hooks/useSubscriptions'
import { formatCurrency, formatDate } from '../../lib/format'
import { subscriptionHealth, HEALTH_DOT, HEALTH_TEXT } from '../../lib/subscriptionHealth'
import { cancelSubscriptionFn } from '../../lib/paymentsApi'

export function Subscriptions() {
  const { data: subscriptions, loading } = useAllSubscriptions()
  const [canceling, setCanceling] = useState<string | null>(null)

  async function handleCancel(id: string, clientName: string) {
    if (!confirm(`Cancelar a assinatura de ${clientName}? A cobrança automática no cartão será interrompida.`))
      return
    setCanceling(id)
    try {
      await cancelSubscriptionFn({ subscriptionId: id })
    } catch (err) {
      alert('Não foi possível cancelar agora. ' + (err as Error).message)
    } finally {
      setCanceling(null)
    }
  }

  const sorted = [...subscriptions].sort((a, b) => {
    const order = { expired: 0, expiring: 1, pending: 2, ok: 3, canceled: 4 }
    return order[subscriptionHealth(a).level] - order[subscriptionHealth(b).level]
  })

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Assinaturas</h1>

      {loading && <Spinner full />}

      {!loading && subscriptions.length === 0 && (
        <Card className="text-center text-sm text-neutral-400">
          Nenhum cliente assinou um plano ainda.
        </Card>
      )}

      <div className="space-y-2">
        {sorted.map((s) => {
          const health = subscriptionHealth(s)
          const canCancel = s.status === 'active' || s.status === 'past_due'
          return (
            <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_DOT[health.level]}`} />
                <div>
                  <p className="text-sm font-medium text-neutral-100">{s.clientName}</p>
                  <p className="text-xs text-neutral-500">
                    {s.planName} · {formatCurrency(s.planPrice)}/mês
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <StatusBadge status={s.status} />
                  <p className={`mt-1 text-xs ${HEALTH_TEXT[health.level]}`}>
                    {s.currentPeriodEnd ? `Vence em ${formatDate(s.currentPeriodEnd)}` : health.label}
                  </p>
                </div>
                {canCancel && (
                  <Button
                    variant="danger"
                    loading={canceling === s.id}
                    onClick={() => handleCancel(s.id, s.clientName)}
                    className="!px-3 !py-1.5 text-xs"
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
