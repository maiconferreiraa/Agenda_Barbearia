import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'
import { notify } from '../lib/notify'
import { CLIENT_CANCEL_MIN_HOURS, formatDateTimeBr } from '../lib/cancelRules'

/**
 * Cliente desmarca o próprio horário pelo app (até CLIENT_CANCEL_MIN_HOURS antes).
 * O crédito do plano volta pelo trigger onAppointmentCanceled.
 */
export const cancelMyAppointment = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Você precisa estar logado.')

  const appointmentId = request.data?.appointmentId as string | undefined
  if (!appointmentId) throw new HttpsError('invalid-argument', 'appointmentId é obrigatório.')

  const ref = db.collection('appointments').doc(appointmentId)
  const snap = await ref.get()
  const appt = snap.data()
  if (!appt || appt.clientId !== uid) throw new HttpsError('not-found', 'Horário não encontrado.')
  if (appt.status !== 'scheduled' && appt.status !== 'confirmed') {
    throw new HttpsError('failed-precondition', 'Esse horário não pode mais ser desmarcado.')
  }

  const when = appt.date.toDate() as Date
  if (when.getTime() - Date.now() < CLIENT_CANCEL_MIN_HOURS * 60 * 60 * 1000) {
    throw new HttpsError(
      'failed-precondition',
      `Só dá pra desmarcar pelo app até ${CLIENT_CANCEL_MIN_HOURS} h antes. Fale com a barbearia.`,
    )
  }

  await ref.update({
    status: 'canceled',
    canceledBy: 'client',
    canceledAt: FieldValue.serverTimestamp(),
  })

  await notify({
    type: 'appointment_canceled',
    targetRole: 'owner',
    relatedId: appointmentId,
    title: 'Horário desmarcado',
    message: `${appt.clientName} desmarcou ${appt.serviceName} de ${formatDateTimeBr(when)}.`,
  })

  return { ok: true as const, creditReturned: appt.usedPlanCredit === true }
})
