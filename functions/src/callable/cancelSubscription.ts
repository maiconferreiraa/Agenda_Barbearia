import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'
import { notify } from '../lib/notify'
import { cancelOpenInvoice } from '../lib/billing'

export const cancelSubscription = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Você precisa estar logado.')

  const subscriptionId = request.data?.subscriptionId as string | undefined
  if (!subscriptionId) throw new HttpsError('invalid-argument', 'subscriptionId é obrigatório.')

  const [userSnap, subSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('subscriptions').doc(subscriptionId).get(),
  ])

  if (userSnap.data()?.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Apenas o proprietário pode cancelar assinaturas.')
  }
  if (!subSnap.exists) throw new HttpsError('not-found', 'Assinatura não encontrada.')
  const sub = subSnap.data()!

  // Sem cobrança recorrente na InfinitePay: basta parar de gerar mensalidades
  // e cancelar a que estiver em aberto.
  await cancelOpenInvoice(subSnap.ref, sub.openInvoice?.id)
  await subSnap.ref.update({
    status: 'canceled',
    canceledAt: FieldValue.serverTimestamp(),
  })

  await notify({
    type: 'plan_canceled',
    targetUserId: sub.clientId,
    relatedId: subscriptionId,
    title: 'Assinatura cancelada',
    message: `Sua assinatura do plano "${sub.planName}" foi cancelada. Não haverá novas cobranças.`,
  })

  return { ok: true as const }
})
