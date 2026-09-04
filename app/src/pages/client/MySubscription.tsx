import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/StatusBadge'
import { useAuth } from '../../contexts/AuthContext'
import { useClientSubscriptions } from '../../hooks/useSubscriptions'
import { usePlans } from '../../hooks/usePlans'
import { formatDate } from '../../lib/format'

export function MySubscription() {
  const { profile } = useAuth()
  const { data: subscriptions, loading } = useClientSubscriptions(profile?.uid)
  const { data: plans } = usePlans()
  const [params] = useSearchParams()
  const status = params.get('status')

  const current = subscriptions.find((s) => s.status === 'active' || s.status === 'pending') ?? subscriptions[0]
  const currentPlan = plans.find((p) => p.id === current?.planId)

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Minha assinatura</h1>

      {status === 'success' && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 text-sm text-emerald-300">
          Autorização enviada ao Mercado Pago! Assim que o pagamento for confirmado, sua assinatura
          fica ativa aqui automaticamente.
        </Card>
      )}
      {status === 'failure' && (
        <Card className="border-red-500/30 bg-red-500/5 text-sm text-red-300">
          A autorização não foi concluída. Tente assinar novamente.
        </Card>
      )}

      {loading && <Spinner full />}

      {!loading && !current && (
        <Card className="text-center">
          <p className="mb-3 text-sm text-neutral-400">Você ainda não tem nenhum plano.</p>
          <Link to="/app/plans">
            <Button>Ver planos disponíveis</Button>
          </Link>
        </Card>
      )}

      {current && (
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-lg text-neutral-100">{current.planName}</p>
              <p className="text-xs text-neutral-500">
                Assinado em {formatDate(current.createdAt)}
              </p>
            </div>
            <StatusBadge status={current.status} />
          </div>

          {current.currentPeriodEnd && (
            <p className="mt-3 text-sm text-neutral-300">
              Próxima cobrança / vencimento:{' '}
              <span className="font-medium text-gold-light">{formatDate(current.currentPeriodEnd)}</span>
            </p>
          )}

          <div className="mt-3">
            <p className="mb-1 text-xs font-medium text-neutral-400">Créditos deste mês</p>
            <ul className="space-y-1 text-sm text-neutral-300">
              {(currentPlan?.includedServices ?? []).map((item) => {
                const used = current.usage?.[item.serviceId] ?? 0
                return (
                  <li key={item.serviceId}>
                    {item.serviceName}: {used}/{item.quantity} usado(s)
                  </li>
                )
              })}
              {(!currentPlan || currentPlan.includedServices.length === 0) && (
                <li className="text-neutral-500">Nenhum crédito utilizado ainda.</li>
              )}
            </ul>
          </div>

          {current.status === 'canceled' && (
            <p className="mt-3 text-xs text-neutral-500">
              Esta assinatura foi cancelada e não haverá novas cobranças.
            </p>
          )}
        </Card>
      )}
    </div>
  )
}
