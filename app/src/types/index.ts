import type { Timestamp } from 'firebase/firestore'

export type Role = 'owner' | 'client'

export interface UserProfile {
  uid: string
  name: string
  email: string
  phone: string
  role: Role
  /** Usuário para entrar sem e-mail (ex.: maicon.ferreira). */
  username?: string
  fcmTokens?: string[]
  /** Ficha criada pelo dono na importação do sistema antigo (sem login no app). */
  imported?: boolean
  hasAccount?: boolean
  createdAt?: Timestamp
}

export interface ServiceItem {
  id: string
  name: string
  description?: string
  durationMinutes: number
  price: number
  category: string
  active: boolean
  createdAt?: Timestamp
}

export interface PlanIncludedService {
  serviceId: string
  serviceName: string
  quantity: number
}

export interface Plan {
  id: string
  name: string
  description?: string
  includedServices: PlanIncludedService[]
  price: number
  active: boolean
  /** Link de cobrança recorrente no cartão, criado pelo dono no app da InfinitePay. */
  recurringLink?: string | null
  createdAt?: Timestamp
}

export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'

export interface Subscription {
  id: string
  clientId: string
  clientName: string
  planId: string
  planName: string
  planPrice: number
  status: SubscriptionStatus
  usage: Record<string, number>
  /** 'card_recurring' = cobrado sozinho no cartão pela InfinitePay (dono confirma o 1º pagamento). */
  billingMode?: 'card_recurring'
  recurringLink?: string | null
  cardRefusedAt?: Timestamp | null
  /** Mensalidade em aberto (link InfinitePay), se houver. */
  openInvoice?: OpenInvoice | null
  /** Upgrade iniciado esperando o pagamento da diferença. */
  pendingUpgrade?: {
    invoiceId: string
    checkoutUrl: string
    amount: number
    planId: string
    planName: string
  } | null
  /** Cliente cancelou pelo app: vale até currentPeriodEnd e depois encerra. */
  cancelAtPeriodEnd?: boolean
  /** Quando os créditos do próximo mês já pago começam. */
  creditsResetAt?: Timestamp
  currentPeriodStart?: Timestamp
  currentPeriodEnd?: Timestamp
  canceledAt?: Timestamp
  createdAt?: Timestamp
}

export interface OpenInvoice {
  id: string
  checkoutUrl: string
  amount: number
  dueDate: Timestamp
  overdue: boolean
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'done'
  | 'canceled'
  | 'no_show'

export interface AppointmentServiceLine {
  serviceId: string
  serviceName: string
  durationMinutes: number
  price: number
  usedPlanCredit: boolean
}

export interface Appointment {
  id: string
  /** null = cliente sem cadastro, marcado pelo dono. */
  clientId: string | null
  clientName: string
  clientPhone?: string
  services: AppointmentServiceLine[]
  serviceName: string
  durationMinutes: number
  price: number
  subscriptionId?: string
  usedPlanCredit?: boolean
  date: Timestamp
  status: AppointmentStatus
  canceledBy?: 'client' | 'owner'
  /** Quem marcou: o próprio cliente pelo app ou o dono pela agenda. */
  bookedBy?: 'client' | 'owner'
  notes?: string
  createdAt?: Timestamp
}

/** Resumo de um horário cancelado (o horário é apagado; isto vai só para o relatório). */
export interface CanceledAppointment {
  id: string
  date: Timestamp
  clientId?: string | null
  clientName: string
  serviceName: string
  price: number
  usedPlanCredit?: boolean
  creditReturned?: boolean
  bookedBy?: 'client' | 'owner' | 'guest' | null
  canceledBy: 'client' | 'owner'
  canceledAt?: Timestamp
}

export type PaymentStatus = 'approved' | 'pending' | 'rejected' | 'refunded'

export interface Payment {
  id: string
  subscriptionId?: string
  appointmentId?: string
  clientId: string
  clientName: string
  amount: number
  status: PaymentStatus
  invoiceId?: string
  /** Plano da mensalidade (ou plano de destino, no upgrade). */
  planName?: string
  kind?: 'first' | 'renewal' | 'upgrade'
  transactionNsu?: string
  captureMethod?: string
  /** Quanto o cliente pagou (maior que amount quando a taxa foi repassada a ele). */
  paidByClient?: number
  feePassedToClient?: boolean
  installments?: number | null
  receiptUrl?: string
  description?: string
  paidAt?: Timestamp
  createdAt?: Timestamp
}

export type NotificationType =
  | 'appointment_new'
  | 'appointment_canceled'
  | 'plan_chosen'
  | 'payment_received'
  | 'payment_failed'
  | 'plan_expiring'
  | 'plan_expired'
  | 'plan_canceled'
  | 'invoice_created'
  | 'payment_overdue'
  | 'whatsapp_failed'

export interface AppNotification {
  id: string
  targetRole?: Role
  targetUserId?: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  relatedId?: string
  link?: string
  createdAt?: Timestamp
}

export interface DayHours {
  enabled: boolean
  open: string
  close: string
}

export interface BusinessSettings {
  name: string
  phone: string
  address: string
  slotDurationMinutes: number
  hours: Record<
    'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun',
    DayHours
  >
  /** Oferta mandada no WhatsApp para quem cancela o plano. */
  retentionOffer?: string
}

/** ownerSettings/taxas — só o dono lê (regras do Firestore). Em %; a API da InfinitePay não informa. */
export interface FeeSettings {
  feePixPercent?: number
  feeCardPercent?: number
}

export const EXPENSE_CATEGORIES = [
  'Aluguel',
  'Energia',
  'Água',
  'Internet e telefone',
  'Itens do salão',
  'Produtos',
  'Funcionários',
  'Impostos e taxas',
  'Outros',
] as const

/** Saída de dinheiro. Com `recurring`, repete todo mês no mesmo dia a partir de `date`. */
export interface Expense {
  id: string
  description: string
  category: string
  amount: number
  date: Timestamp
  recurring: boolean
  /** Fim da repetição ("parar de repetir"). */
  endedAt?: Timestamp | null
  createdAt?: Timestamp
}

