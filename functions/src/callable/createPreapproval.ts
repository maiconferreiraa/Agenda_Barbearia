import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/admin'
import { preApprovalApi } from '../lib/mercadopago'
import { MP_ACCESS_TOKEN, APP_BASE_URL } from '../lib/params'
import { REGION } from '../lib/region'
import { notify } from '../lib/notify'

export const createPreapproval = onCall(
  { region: REGION, secrets: [MP_ACCESS_TOKEN] },
  async (request) => {
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

    const existing = await db
      .collection('subscriptions')
      .where('clientId', '==', uid)
      .where('status', 'in', ['active', 'pending'])
      .limit(1)
      .get()
    if (!existing.empty) {
      throw new HttpsError('already-exists', 'Você já tem uma assinatura ativa ou pendente.')
    }

    const subRef = db.collection('subscriptions').doc()
    await subRef.set({
      clientId: uid,
      clientName: user.name,
      planId,
      planName: plan.name,
      planPrice: plan.price,
      status: 'pending',
      usage: {},
      createdAt: FieldValue.serverTimestamp(),
    })

    const baseUrl = APP_BASE_URL.value() || 'http://localhost:5173'

    try {
      const preapproval = await preApprovalApi().create({
        body: {
          reason: `${plan.name} - Barbearia Primer`,
          external_reference: subRef.id,
          payer_email: user.email,
          back_url: `${baseUrl}/app/subscription`,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: plan.price,
            currency_id: 'BRL',
          },
          status: 'pending',
        },
      })

      await subRef.update({
        mpPreapprovalId: preapproval.id,
      })

      await notify({
        type: 'plan_chosen',
        targetRole: 'owner',
        relatedId: subRef.id,
        title: 'Novo plano escolhido',
        message: `${user.name} iniciou a assinatura do plano "${plan.name}".`,
      })

      return { initPoint: preapproval.init_point }
    } catch (err) {
      await subRef.update({ status: 'canceled', error: String(err) })
      throw new HttpsError('internal', 'Não foi possível iniciar a assinatura no Mercado Pago.')
    }
  },
)
