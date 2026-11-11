import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

export const subscribePlanFn = httpsCallable<
  { planId: string },
  { checkoutUrl: string }
>(functions, 'subscribePlan')

export const confirmInvoicePaymentFn = httpsCallable<
  { orderNsu: string; transactionNsu: string; slug: string },
  { paid: boolean }
>(functions, 'confirmInvoicePayment')

export const cancelSubscriptionFn = httpsCallable<
  { subscriptionId: string },
  { ok: true }
>(functions, 'cancelSubscription')

export const connectInfinitePayFn = httpsCallable<
  { handle?: string; disconnect?: boolean },
  { handle: string | null }
>(functions, 'connectInfinitePay')

export const cancelMyPlanFn = httpsCallable<
  { subscriptionId: string; undo?: boolean },
  { status: 'active' | 'canceled' }
>(functions, 'cancelMyPlan')
