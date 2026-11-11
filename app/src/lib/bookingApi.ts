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

/** Login por usuário (ex.: maicon.ferreira): o servidor confere e devolve um token para entrar. */
export const loginWithUsernameFn = callApi<{ username: string; password: string }, { token: string }>(
  'loginWithUsername',
)
export const usernameAvailableFn = callApi<{ username: string }, { available: boolean; reason?: string }>(
  'usernameAvailable',
)
export const claimUsernameFn = callApi<{ username: string }, { username: string }>('claimUsername')

/** Sugere um usuário a partir do nome: "Maicon Ferreira" → "maicon.ferreira". */
export function suggestUsername(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 30)
}

export const USERNAME_RULE = /^[a-z0-9](?:[a-z0-9._]{1,28})[a-z0-9]$/
