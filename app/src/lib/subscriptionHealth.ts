import { daysUntil } from './format'
import type { Subscription } from '../types'

export type HealthLevel = 'ok' | 'expiring' | 'expired' | 'canceled' | 'pending'

export function subscriptionHealth(sub: Subscription): {
  level: HealthLevel
  label: string
  daysLeft: number | null
} {
  const daysLeft = daysUntil(sub.currentPeriodEnd)

  if (sub.status === 'canceled') return { level: 'canceled', label: 'Cancelado', daysLeft }
  if (sub.status === 'expired' || sub.status === 'past_due') {
    return { level: 'expired', label: 'Vencido', daysLeft }
  }
  if (sub.status === 'pending') return { level: 'pending', label: 'Aguardando pagamento', daysLeft }

  if (daysLeft !== null && daysLeft <= 3) {
    return { level: 'expiring', label: `Vence em ${Math.max(daysLeft, 0)} dia(s)`, daysLeft }
  }
  return { level: 'ok', label: 'Em dia', daysLeft }
}

export const HEALTH_DOT: Record<HealthLevel, string> = {
  ok: 'bg-emerald-400',
  expiring: 'bg-amber-400',
  expired: 'bg-red-500',
  canceled: 'bg-neutral-500',
  pending: 'bg-sky-400',
}

export const HEALTH_TEXT: Record<HealthLevel, string> = {
  ok: 'text-emerald-400',
  expiring: 'text-amber-400',
  expired: 'text-red-400',
  canceled: 'text-neutral-400',
  pending: 'text-sky-400',
}
