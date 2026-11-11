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
