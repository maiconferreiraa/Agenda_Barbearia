import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

export const bookAppointmentFn = httpsCallable<
  { serviceIds: string[]; dateISO: string },
  { appointmentId: string; usedPlanCredit: boolean }
>(functions, 'bookAppointment')

export const getAvailableSlotsFn = httpsCallable<
  { serviceIds: string[]; dateISO: string },
  { slots: string[] }
>(functions, 'getAvailableSlots')

/** Mesma regra do servidor (functions/src/lib/cancelRules.ts). */
export const CLIENT_CANCEL_MIN_HOURS = 2

export const cancelMyAppointmentFn = httpsCallable<
  { appointmentId: string },
  { ok: true; creditReturned: boolean }
>(functions, 'cancelMyAppointment')
