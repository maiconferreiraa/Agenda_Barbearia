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
