import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/StatusBadge'
import { useAuth } from '../../contexts/AuthContext'
import { useClientSubscriptions } from '../../hooks/useSubscriptions'
import { usePlans } from '../../hooks/usePlans'
import { formatCurrency, formatDate } from '../../lib/format'
import { cancelMyPlanFn, confirmInvoicePaymentFn } from '../../lib/paymentsApi'

type ReturnState = 'checking' | 'paid' | 'not_paid' | null

export function MySubscription() {
  const { profile } = useAuth()
  const { data: subscriptions, loading } = useClientSubscriptions(profile?.uid)
  const { data: plans } = usePlans()
  const [params, setParams] = useSearchParams()
  const [returnState, setReturnState] = useState<ReturnState>(null)
  const confirmedOnce = useRef(false)

  // Volta do checkout da InfinitePay: confirma o pagamento na hora (reserva do webhook).
  useEffect(() => {
    const orderNsu = params.get('order_nsu')
    const transactionNsu = params.get('transaction_nsu')
    const slug = params.get('slug')
    if (!orderNsu || !transactionNsu || !slug || confirmedOnce.current) return
    confirmedOnce.current = true
    setReturnState('checking')
    confirmInvoicePaymentFn({ orderNsu, transactionNsu, slug })
      .then((res) => setReturnState(res.data.paid ? 'paid' : 'not_paid'))
      .catch(() => setReturnState('not_paid'))
      .finally(() => setParams({}, { replace: true }))
  }, [params, setParams])

  const current =
    subscriptions.find((s) => ['active', 'pending', 'past_due'].includes(s.status)) ??
    subscriptions.find((s) => s.status === 'expired' && s.openInvoice) ??
    subscriptions[0]
  const invoice = current?.openInvoice
  const [planBusy, setPlanBusy] = useState(false)
  const [planError, setPlanError] = useState('')

  async function handleCancelPlan() {
    if (!current) return
    const msg =
      current.status === 'active'
        ? `Cancelar o plano "${current.planName}"? Você continua usando até ${formatDate(current.currentPeriodEnd)} e não haverá novas cobranças.`
        : `Cancelar o plano "${current.planName}"? A mensalidade em aberto será cancelada.`
    if (!confirm(msg)) return
    setPlanBusy(true)
    setPlanError('')
    try {
      await cancelMyPlanFn({ subscriptionId: current.id })
    } catch (err) {
      setPlanError((err as Error).message || 'Não foi possível cancelar.')
    } finally {
      setPlanBusy(false)
    }
  }

  async function handleKeepPlan() {
    if (!current) return
    setPlanBusy(true)
    setPlanError('')
    try {
      await cancelMyPlanFn({ subscriptionId: current.id, undo: true })
    } catch (err) {
      setPlanError((err as Error).message || 'Não foi possível manter o plano.')
    } finally {
      setPlanBusy(false)
    }
  }

  const canCancelPlan =
    !!current &&
    ['active', 'pending', 'past_due'].includes(current.status) &&
    !current.cancelAtPeriodEnd
  const currentPlan = plans.find((p) => p.id === current?.planId)
  const included = currentPlan?.includedServices ?? []
  const allCreditsUsed =
    included.length > 0 && included.every((i) => (current?.usage?.[i.serviceId] ?? 0) >= i.quantity)

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Minha assinatura</h1>

      {returnState === 'checking' && (
        <Card className="text-sm text-neutral-300">Confirmando seu pagamento…</Card>
      )}
      {returnState === 'paid' && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 text-sm text-emerald-300">
          Pagamento confirmado! Seu plano está em dia.
        </Card>
      )}
      {returnState === 'not_paid' && (
        <Card className="border-amber-500/30 bg-amber-500/5 text-sm text-amber-300">
          Ainda não recebemos a confirmação do pagamento. Se você já pagou, ela chega em alguns
          minutos e esta tela atualiza sozinha.
        </Card>
      )}

      {invoice && (
        <Card
          className={
            invoice.overdue
              ? 'border-red-500/40 bg-red-500/5'
              : 'border-gold/30 bg-gold/5'
          }
        >
          <p className={`text-sm font-medium ${invoice.overdue ? 'text-red-300' : 'text-gold-light'}`}>
            {invoice.overdue
              ? `Mensalidade em atraso desde ${formatDate(invoice.dueDate)}`
              : current?.status === 'pending'
                ? 'Falta pagar a 1ª mensalidade para ativar o plano'
                : `Mensalidade disponível — vence em ${formatDate(invoice.dueDate)}`}
          </p>
          <p className="mt-1 font-display text-2xl text-neutral-100">
            {formatCurrency(invoice.amount)}
          </p>
          {invoice.overdue && (
            <p className="mt-1 text-xs text-red-300/80">
              Os benefícios do plano ficam pausados até o pagamento.
            </p>
          )}
          <a href={invoice.checkoutUrl} className="mt-3 block">
            <Button className="w-full">Pagar mensalidade (Pix ou cartão)</Button>
          </a>
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
              {current.billingMode === 'card_recurring' ? 'Próxima cobrança no cartão' : 'Próxima cobrança / vencimento'}:{' '}
              <span className="font-medium text-gold-light">{formatDate(current.currentPeriodEnd)}</span>
            </p>
          )}

          {current.billingMode === 'card_recurring' && current.status === 'active' && (
            <p className="mt-1 text-xs text-neutral-500">💳 Descontado sozinho no seu cartão todo mês (InfinitePay).</p>
          )}
          {current.billingMode === 'card_recurring' && current.status === 'pending' && (
            <div className="mt-3 space-y-2 rounded-md border border-gold/30 bg-gold/5 p-3 text-sm text-gold-light">
              <p>Aguardando a barbearia confirmar o seu pagamento no cartão. O plano ativa assim que confirmar.</p>
              {current.recurringLink && (
                <a href={current.recurringLink} className="block text-xs underline underline-offset-2">
                  Ainda não pagou? Abrir o link de pagamento
                </a>
              )}
            </div>
          )}
          {current.billingMode === 'card_recurring' && current.status === 'past_due' && (
            <div className="mt-3 space-y-2 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-300">
              <p>🚨 A cobrança não passou no seu cartão. Os benefícios ficam pausados até regularizar.</p>
              {current.recurringLink && (
                <a href={current.recurringLink} className="block">
                  <Button className="w-full">Cadastrar o cartão de novo</Button>
                </a>
              )}
            </div>
          )}

          <div className="mt-3">
            <p className="mb-1 text-xs font-medium text-neutral-400">Créditos deste mês</p>
            <ul className="space-y-1 text-sm text-neutral-300">
              {(currentPlan?.includedServices ?? []).map((item) => {
                const used = current.usage?.[item.serviceId] ?? 0
                const esgotado = used >= item.quantity
                return (
                  <li key={item.serviceId} className="flex items-center justify-between gap-2">
                    <span className={esgotado ? 'text-neutral-500' : ''}>
                      {item.serviceName}: {Math.min(used, item.quantity)}/{item.quantity} usado(s)
                    </span>
                    {esgotado && (
                      <span className="rounded bg-neutral-700/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                        esgotado
                      </span>
                    )}
                  </li>
                )
              })}
              {(!currentPlan || currentPlan.includedServices.length === 0) && (
                <li className="text-neutral-500">Nenhum crédito utilizado ainda.</li>
              )}
            </ul>
          </div>

          {current.status === 'active' && allCreditsUsed && (
            <div className="mt-4 space-y-2 rounded-md border border-gold/30 bg-gold/5 p-3">
              <p className="text-sm text-gold-light">
                Você já usou todos os créditos deste mês. Eles renovam em{' '}
                <b>{formatDate(current.creditsResetAt ?? current.currentPeriodEnd)}</b>.
              </p>
              <p className="text-xs text-neutral-400">
                Quer mais? Faça upgrade e pague só a diferença — os créditos novos valem na hora.
              </p>
              <Link to="/app/plans" className="block">
                <Button className="w-full">Ver planos maiores</Button>
              </Link>
            </div>
          )}

          {current.status === 'active' && current.pendingUpgrade && (
            <div className="mt-4 space-y-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-3">
              <p className="text-sm text-sky-300">
                Upgrade para <b>{current.pendingUpgrade.planName}</b> esperando o pagamento de{' '}
                <b>{formatCurrency(current.pendingUpgrade.amount)}</b>.
              </p>
              <a href={current.pendingUpgrade.checkoutUrl} className="block">
                <Button variant="secondary" className="w-full">Pagar upgrade</Button>
              </a>
            </div>
          )}

          {current.status === 'canceled' && (
            <p className="mt-3 text-xs text-neutral-500">
              Esta assinatura foi cancelada e não haverá novas cobranças.
            </p>
          )}

          {current.status === 'active' && current.cancelAtPeriodEnd && (
            <div className="mt-4 space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-sm text-amber-300">
                Você cancelou este plano. Ele vale até{' '}
                <b>{formatDate(current.currentPeriodEnd)}</b> e não haverá novas cobranças.
              </p>
              <Button variant="secondary" loading={planBusy} onClick={handleKeepPlan} className="!px-3 !py-1.5 text-xs">
                Quero manter meu plano
              </Button>
            </div>
          )}

          {canCancelPlan && (
            <button
              type="button"
              disabled={planBusy}
              onClick={handleCancelPlan}
              className="mt-4 text-xs text-neutral-500 underline underline-offset-2 hover:text-red-300 disabled:opacity-50"
            >
              {planBusy ? 'Cancelando…' : 'Cancelar plano'}
            </button>
          )}
          {planError && <p className="mt-2 text-sm text-red-400">{planError}</p>}
        </Card>
      )}
    </div>
  )
}
