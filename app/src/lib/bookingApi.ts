import { callApi } from './api'
import type { AppointmentStatus } from '../types'

export const bookAppointmentFn = callApi<
  { serviceIds: string[]; dateISO: string },
  { appointmentId: string; usedPlanCredit: boolean }
>('bookAppointment')

export const getAvailableSlotsFn = callApi<
  { serviceIds: string[]; dateISO: string },
  { slots: string[] }
>('getAvailableSlots')

/** Mesma regra do servidor (worker/src/api/booking.ts). */
export const CLIENT_CANCEL_MIN_HOURS = 2

export const cancelMyAppointmentFn = callApi<
  { appointmentId: string },
  { ok: true; creditReturned: boolean }
>('cancelMyAppointment')

/** Dono muda o status pela agenda; cancelar devolve o crédito do plano. */
export const setAppointmentStatusFn = callApi<
  { appointmentId: string; status: AppointmentStatus },
  { ok: true; creditReturned: boolean }
>('setAppointmentStatus')

export const claimOwnerRoleFn = callApi<{ inviteCode: string }, { ok: true }>('claimOwnerRole')
