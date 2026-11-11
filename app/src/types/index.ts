import type { Timestamp } from 'firebase/firestore'

export type Role = 'owner' | 'client'

export interface UserProfile {
  uid: string
  name: string
  email: string
  phone: string
  role: Role
  fcmTokens?: string[]
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
  /** Mensalidade em aberto (link InfinitePay), se houver. */
  openInvoice?: OpenInvoice | null
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
  clientId: string
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
  notes?: string
  createdAt?: Timestamp
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
  transactionNsu?: string
  captureMethod?: string
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
  mercadoPagoConnected: boolean
}
