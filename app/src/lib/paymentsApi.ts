import { callApi } from './api'

export const subscribePlanFn = callApi<
  { planId: string },
  { checkoutUrl: string }
>('subscribePlan')

export const confirmInvoicePaymentFn = callApi<
  { orderNsu: string; transactionNsu: string; slug: string },
  { paid: boolean }
>('confirmInvoicePayment')

export const cancelSubscriptionFn = callApi<
  { subscriptionId: string },
  { ok: true }
>('cancelSubscription')

export const connectInfinitePayFn = callApi<
  { handle?: string; disconnect?: boolean },
  { handle: string | null }
>('connectInfinitePay')

export const cancelMyPlanFn = callApi<
  { subscriptionId: string; undo?: boolean },
  { status: 'active' | 'canceled' }
>('cancelMyPlan')

/** Upgrade: paga só a diferença; o plano muda na hora ao pagar. */
export const upgradePlanFn = callApi<{ planId: string }, { checkoutUrl: string; amount: number }>('upgradePlan')

/** Dono passa um assinante do sistema antigo pro novo (a régua de cobrança assume dali em diante). */
export const importSubscriptionFn = callApi<
  {
    name: string
    phone: string
    planId: string
    /** AAAA-MM-DD */
    dueDate: string
    paid: boolean
    usage: Record<string, number>
    welcome: boolean
  },
  { subscriptionId: string; clientId: string; checkoutUrl: string | null; welcomeQueued: boolean; reusedClient: boolean }
>('importSubscription')

/** Dono corrige o telefone (WhatsApp) de um cliente. */
export const updateClientPhoneFn = callApi<{ clientId: string; phone: string }, { phone: string }>('updateClientPhone')
