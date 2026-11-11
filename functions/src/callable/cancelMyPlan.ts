import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'
import { notify } from '../lib/notify'
import { cancelOpenInvoice, formatBr } from '../lib/billing'

/**
 * Cliente cancela o próprio plano pelo app.
 *
 * - Plano em dia (active): continua valendo até o fim do mês já pago
 *   (`cancelAtPeriodEnd`); a mensalidade seguinte em aberto é cancelada e não
 *   são geradas novas. Até essa data ele pode desistir (`undo: true`).
 * - Aguardando 1º pagamento ou em atraso: cancela na hora.
 */
export const cancelMyPlan = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Você precisa estar logado.')

  const subscriptionId = request.data?.subscriptionId as string | undefined
  const undo = request.data?.undo === true
  if (!subscriptionId) throw new HttpsError('invalid-argument', 'subscriptionId é obrigatório.')

  const ref = db.collection('subscriptions').doc(subscriptionId)
  const snap = await ref.get()
  const sub = snap.data()
  if (!sub || sub.clientId !== uid) throw new HttpsError('not-found', 'Assinatura não encontrada.')

  if (undo) {
    if (sub.status !== 'active' || !sub.cancelAtPeriodEnd) {
      throw new HttpsError('failed-precondition', 'Não há cancelamento para desfazer.')
    }
    await ref.update({ cancelAtPeriodEnd: false, cancelRequestedAt: null })
    await notify({
      type: 'plan_chosen',
      targetRole: 'owner',
      relatedId: subscriptionId,
      title: 'Cliente manteve o plano',
      message: `${sub.clientName} desistiu de cancelar o plano "${sub.planName}".`,
    })
    return { status: 'active' as const }
  }

  if (sub.status === 'active') {
    if (sub.cancelAtPeriodEnd) return { status: 'active' as const }
    await cancelOpenInvoice(ref, sub.openInvoice?.id)
    await ref.update({ cancelAtPeriodEnd: true, cancelRequestedAt: FieldValue.serverTimestamp() })
    const end = sub.currentPeriodEnd?.toDate?.() as Date | undefined
    const ate = end ? ` até ${formatBr(end)}` : ''
    await notify({
      type: 'plan_canceled',
      targetRole: 'owner',
      relatedId: subscriptionId,
      title: 'Cliente cancelou o plano',
      message: `${sub.clientName} cancelou o plano "${sub.planName}". Ele continua valendo${ate} e não haverá novas cobranças.`,
    })
    return { status: 'active' as const }
  }

  if (sub.status === 'pending' || sub.status === 'past_due') {
    await cancelOpenInvoice(ref, sub.openInvoice?.id)
    await ref.update({ status: 'canceled', canceledAt: FieldValue.serverTimestamp(), canceledBy: 'client' })
    await notify({
      type: 'plan_canceled',
      targetRole: 'owner',
      relatedId: subscriptionId,
      title: 'Cliente cancelou o plano',
      message: `${sub.clientName} cancelou o plano "${sub.planName}"${sub.status === 'past_due' ? ' (estava em atraso)' : ''}.`,
    })
    return { status: 'canceled' as const }
  }

  throw new HttpsError('failed-precondition', 'Este plano já está encerrado.')
})
