import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { usePlans } from '../../hooks/usePlans'
import { useAuth } from '../../contexts/AuthContext'
import { useClientSubscriptions } from '../../hooks/useSubscriptions'
import { formatCurrency } from '../../lib/format'
import { subscribePlanFn, upgradePlanFn } from '../../lib/paymentsApi'
import type { Plan, Subscription } from '../../types'

export function PlansCatalog() {
  const { profile } = useAuth()
  const { data: plans, loading } = usePlans({ onlyActive: true })
  const { data: subscriptions } = useClientSubscriptions(profile?.uid)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [error, setError] = useState('')

  const activeSub = subscriptions.find(
    (s) => s.status === 'active' || s.status === 'pending' || s.status === 'past_due',
  )

  async function handleUpgrade(planId: string, planName: string, diff: number) {
    if (!confirm(`Fazer upgrade para "${planName}"? Você paga só a diferença (${formatCurrency(diff)}) agora e os créditos novos valem na hora. O vencimento continua o mesmo.`))
      return
    setSubscribing(planId)
    setError('')
    try {
      const res = await upgradePlanFn({ planId })
      window.location.href = res.data.checkoutUrl
    } catch (err) {
      setError((err as Error).message || 'Não foi possível iniciar o upgrade.')
      setSubscribing(null)
    }
  }

  async function handleSubscribe(planId: string) {
    setSubscribing(planId)
    setError('')
    try {
      const res = await subscribePlanFn({ planId })
      window.location.href = res.data.checkoutUrl
    } catch (err) {
      setError((err as Error).message || 'Não foi possível iniciar a assinatura.')
      setSubscribing(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Planos mensais</h1>
      <p className="text-sm text-neutral-500">
        Assine um plano e pague a mensalidade por Pix ou cartão via InfinitePay. Todo mês você recebe o aviso com o link de pagamento.
      </p>

      {activeSub && (
        <Card className="border-gold/30 bg-gold/5 text-sm text-gold-light">
          Você já {activeSub.status === 'pending' ? 'iniciou a assinatura de' : 'está assinando'} o
          plano <b>{activeSub.planName}</b>. Veja detalhes em "Assinatura".
          {activeSub.status === 'active' && ' Quer mais créditos? Faça upgrade abaixo pagando só a diferença.'}
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
            <PlanAction
              plan={p}
              activeSub={activeSub}
              busy={subscribing === p.id}
              onSubscribe={() => handleSubscribe(p.id)}
              onUpgrade={(diff) => handleUpgrade(p.id, p.name, diff)}
            />
          </Card>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

/** Botão de cada plano: assinar, "seu plano", upgrade (mais caro) ou indisponível. */
function PlanAction(props: {
  plan: Plan
  activeSub: Subscription | undefined
  busy: boolean
  onSubscribe: () => void
  onUpgrade: (diff: number) => void
}) {
  const { plan, activeSub, busy } = props
  if (!activeSub) {
    return (
      <Button className="mt-4" loading={busy} onClick={props.onSubscribe}>
        Assinar este plano
      </Button>
    )
  }
  if (activeSub.planId === plan.id) {
    return (
      <Button className="mt-4" disabled>
        Seu plano atual
      </Button>
    )
  }
  const diff = Math.round((plan.price - activeSub.planPrice) * 100) / 100
  if (activeSub.status === 'active' && !activeSub.cancelAtPeriodEnd && diff > 0) {
    return (
      <Button className="mt-4" loading={busy} onClick={() => props.onUpgrade(diff)}>
        Fazer upgrade (+{formatCurrency(diff)})
      </Button>
    )
  }
  return (
    <Button className="mt-4" disabled>
      {diff > 0 ? 'Upgrade disponível com o plano em dia' : 'Você já tem um plano'}
    </Button>
  )
}
