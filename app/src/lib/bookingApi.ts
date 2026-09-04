import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

export const bookAppointmentFn = httpsCallable<
  { serviceId: string; dateISO: string },
  { appointmentId: string; usedPlanCredit: boolean }
>(functions, 'bookAppointment')

export const getAvailableSlotsFn = httpsCallable<
  { serviceId: string; dateISO: string },
  { slots: string[] }
>(functions, 'getAvailableSlots')
