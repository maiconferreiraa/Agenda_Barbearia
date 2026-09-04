import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

export const createPreapprovalFn = httpsCallable<
  { planId: string },
  { initPoint: string }
>(functions, 'createPreapproval')

export const cancelSubscriptionFn = httpsCallable<
  { subscriptionId: string },
  { ok: true }
>(functions, 'cancelSubscription')
