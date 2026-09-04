import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { usePlans } from '../../hooks/usePlans'
import { useAuth } from '../../contexts/AuthContext'
import { useClientSubscriptions } from '../../hooks/useSubscriptions'
import { formatCurrency } from '../../lib/format'
import { createPreapprovalFn } from '../../lib/paymentsApi'

export function PlansCatalog() {
  const { profile } = useAuth()
  const { data: plans, loading } = usePlans({ onlyActive: true })
  const { data: subscriptions } = useClientSubscriptions(profile?.uid)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [error, setError] = useState('')

  const activeSub = subscriptions.find((s) => s.status === 'active' || s.status === 'pending')

  async function handleSubscribe(planId: string) {
    setSubscribing(planId)
    setError('')
    try {
      const res = await createPreapprovalFn({ planId })
      window.location.href = res.data.initPoint
    } catch (err) {
      setError((err as Error).message || 'Não foi possível iniciar a assinatura.')
      setSubscribing(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Planos mensais</h1>
      <p className="text-sm text-neutral-500">
        Assine um plano e pague automaticamente todo mês no cartão via Mercado Pago.
      </p>

      {activeSub && (
        <Card className="border-gold/30 bg-gold/5 text-sm text-gold-light">
          Você já {activeSub.status === 'pending' ? 'iniciou a assinatura de' : 'está assinando'} o
          plano <b>{activeSub.planName}</b>. Veja detalhes em "Assinatura".
        </Card>
      )}

      {loading && <Spinner full />}

      {!loading && plans.length === 0 && (
        <Card className="text-center text-sm text-neutral-400">
          Nenhum plano disponível no momento.
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.id} className="flex flex-col">
            <p className="font-display text-lg text-neutral-100">{p.name}</p>
            <p className="mt-1 font-display text-2xl text-gold-light">
              {formatCurrency(p.price)}
              <span className="text-sm text-neutral-500">/mês</span>
            </p>
            {p.description && <p className="mt-2 text-sm text-neutral-400">{p.description}</p>}
            <ul className="mt-3 space-y-1 text-sm text-neutral-300">
              {p.includedServices.map((i) => (
                <li key={i.serviceId}>✓ {i.quantity}x {i.serviceName} por mês</li>
              ))}
            </ul>
            <Button
              className="mt-4"
              disabled={!!activeSub}
              loading={subscribing === p.id}
              onClick={() => handleSubscribe(p.id)}
            >
              {activeSub ? 'Você já tem um plano' : 'Assinar este plano'}
            </Button>
          </Card>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
