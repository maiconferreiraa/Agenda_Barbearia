import { callApi } from './api'

export const subscribePlanFn = callApi<
  { planId: string },
  { checkoutUrl: string; cardRecurring?: boolean }
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
    /** true = em dia; false = em aberto; 'card' = já paga no cartão recorrente */
    paid: boolean | 'card'
    usage: Record<string, number>
    welcome: boolean
    birthday?: string | null
  },
  { subscriptionId: string; clientId: string; checkoutUrl: string | null; welcomeQueued: boolean; reusedClient: boolean }
>('importSubscription')

/** Dono corrige o telefone (WhatsApp) de um cliente. */
export const updateClientPhoneFn = callApi<
  { clientId: string; phone: string; birthday?: string | null },
  { phone: string; birthday: string | null }
>('updateClientPhone')

/** Cartão recorrente: dono confirma que o pagamento apareceu na InfinitePay. */
export const confirmCardPaymentFn = callApi<{ subscriptionId: string }, { ok: true }>('confirmCardPayment')

/** Cartão recorrente: a InfinitePay avisou que a cobrança não passou. */
export const markCardRefusedFn = callApi<{ subscriptionId: string }, { ok: true }>('markCardRefused')

// ---------- Equipe (colaboradores) ----------
export const createCollaboratorFn = callApi<
  { name: string; phone: string; username: string; password: string; commissionPercent: number },
  { uid: string; username: string }
>('createCollaborator')

export const updateTeamMemberFn = callApi<
  { id: string; attends?: boolean; commissionPercent?: number; active?: boolean; name?: string },
  { ok: true }
>('updateTeamMember')

export const setCollaboratorPasswordFn = callApi<{ id: string; password: string }, { ok: true }>('setCollaboratorPassword')
