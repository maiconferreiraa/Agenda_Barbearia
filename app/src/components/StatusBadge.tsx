import clsx from 'clsx'
import type { AppointmentStatus, PaymentStatus, SubscriptionStatus } from '../types'

type AnyStatus = SubscriptionStatus | AppointmentStatus | PaymentStatus

const LABELS: Record<AnyStatus, string> = {
  active: 'Ativo',
  pending: 'Pendente',
  past_due: 'Pagamento atrasado',
  canceled: 'Cancelado',
  expired: 'Vencido',
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  done: 'Concluído',
  no_show: 'Não compareceu',
  approved: 'Aprovado',
  rejected: 'Recusado',
  refunded: 'Reembolsado',
}

const COLORS: Record<AnyStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  confirmed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  done: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  scheduled: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  past_due: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  expired: 'bg-red-500/15 text-red-400 border-red-500/30',
  canceled: 'bg-red-500/15 text-red-400 border-red-500/30',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
  no_show: 'bg-red-500/15 text-red-400 border-red-500/30',
  refunded: 'bg-neutral-500/15 text-neutral-400 border-neutral-500/30',
}

export function StatusBadge({ status }: { status: AnyStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        COLORS[status],
      )}
    >
      {LABELS[status]}
    </span>
  )
}
