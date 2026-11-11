import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'
import { notify } from '../lib/notify'
import { addMonths, createInvoice } from '../lib/billing'
import { PAYMENT_SETTINGS_DOC, normalizeHandle } from '../lib/infinitepay'

/**
 * Cliente escolhe um plano: cria a assinatura "pending" e a 1ª mensalidade
 * na InfinitePay. Devolve o link do checkout (Pix ou cartão).
 */
export const subscribePlan = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Você precisa estar logado.')

  const planId = request.data?.planId as string | undefined
  if (!planId) throw new HttpsError('invalid-argument', 'planId é obrigatório.')

  const [userSnap, planSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('plans').doc(planId).get(),
  ])

  if (!userSnap.exists) throw new HttpsError('not-found', 'Usuário não encontrado.')
  const user = userSnap.data()!
  if (user.role !== 'client') {
    throw new HttpsError('permission-denied', 'Apenas clientes podem assinar planos.')
  }
  if (!planSnap.exists || planSnap.data()?.active !== true) {
    throw new HttpsError('not-found', 'Plano indisponível.')
  }
  const plan = planSnap.data()!

  const payment = await PAYMENT_SETTINGS_DOC.get()
  if (!normalizeHandle(payment.data()?.infinitePayHandle)) {
    throw new HttpsError(
      'failed-precondition',
      'A barbearia ainda não ativou o pagamento online. Fale com a barbearia.',
    )
  }

  const existing = await db
    .collection('subscriptions')
    .where('clientId', '==', uid)
    .where('status', 'in', ['active', 'pending', 'past_due'])
    .limit(1)
    .get()
  if (!existing.empty) {
    const sub = existing.docs[0].data()
    // Já começou a assinar e não pagou: devolve o mesmo link em vez de criar outro.
    if (sub.status === 'pending' && sub.openInvoice?.checkoutUrl) {
      return { checkoutUrl: sub.openInvoice.checkoutUrl as string }
    }
    throw new HttpsError('already-exists', 'Você já tem uma assinatura ativa ou pendente.')
  }

  const subRef = db.collection('subscriptions').doc()
  const subData = {
    clientId: uid,
    clientName: user.name as string,
    planId,
    planName: plan.name as string,
    planPrice: plan.price as number,
  }
  await subRef.set({
    ...subData,
    status: 'pending',
    usage: {},
    openInvoice: null,
    createdAt: FieldValue.serverTimestamp(),
  })

  try {
    const now = new Date()
    const { checkoutUrl } = await createInvoice({
      subRef,
      sub: subData,
      kind: 'first',
      dueDate: now,
      periodStart: now,
      periodEnd: addMonths(now, 1),
    })

    await notify({
      type: 'plan_chosen',
      targetRole: 'owner',
      relatedId: subRef.id,
      title: 'Novo plano escolhido',
      message: `${user.name} iniciou a assinatura do plano "${plan.name}".`,
    })

    return { checkoutUrl }
  } catch (err) {
    logger.error('Falha ao criar a 1ª mensalidade na InfinitePay', err)
    await subRef.update({ status: 'canceled', error: String(err) })
    throw new HttpsError('internal', 'Não foi possível gerar a cobrança na InfinitePay.')
  }
})
