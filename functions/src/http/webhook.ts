import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/admin'
import { preApprovalApi, paymentApi } from '../lib/mercadopago'
import { MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET } from '../lib/params'
import { REGION } from '../lib/region'
import { isValidMpSignature } from '../lib/verifySignature'
import { notify } from '../lib/notify'

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000

/** Usa a próxima data de cobrança informada pelo Mercado Pago; se ausente, estima 30 dias. */
function nextPeriodEnd(mpNextPaymentDate: string | undefined, fallbackFrom: Date): Date {
  if (mpNextPaymentDate) {
    const parsed = new Date(mpNextPaymentDate)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date(fallbackFrom.getTime() + ONE_MONTH_MS)
}

export const mercadoPagoWebhook = onRequest(
  { region: REGION, secrets: [MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET] },
  async (req, res) => {
    const type = (req.body?.type ?? req.query.type) as string | undefined
    const dataId = (req.body?.data?.id ?? req.query['data.id']) as string | undefined

    if (!type || !dataId) {
      res.status(200).send('ignored')
      return
    }

    const secret = MP_WEBHOOK_SECRET.value()
    const valid = isValidMpSignature({
      xSignature: req.header('x-signature'),
      xRequestId: req.header('x-request-id'),
      dataId,
      secret,
    })
    if (!valid) {
      logger.warn('Assinatura de webhook inválida', { type, dataId })
      res.status(401).send('invalid signature')
      return
    }

    try {
      if (type === 'preapproval') {
        await handlePreapproval(dataId)
      } else if (type === 'payment') {
        await handlePayment(dataId)
      }
      res.status(200).send('ok')
    } catch (err) {
      logger.error('Erro processando webhook do Mercado Pago', err)
      res.status(500).send('error')
    }
  },
)

async function handlePreapproval(preapprovalId: string) {
  const preapproval = await preApprovalApi().get({ id: preapprovalId })
  const subSnap = await db
    .collection('subscriptions')
    .where('mpPreapprovalId', '==', preapprovalId)
    .limit(1)
    .get()
  if (subSnap.empty) return
  const subRef = subSnap.docs[0].ref
  const sub = subSnap.docs[0].data()

  if (preapproval.status === 'authorized') {
    if (sub.status !== 'active') {
      const now = new Date()
      await subRef.update({
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: nextPeriodEnd(preapproval.next_payment_date, now),
        usage: {},
        expiringNotified: false,
      })
    }
  } else if (preapproval.status === 'paused') {
    await subRef.update({ status: 'past_due' })
    await notify({
      type: 'payment_failed',
      targetRole: 'owner',
      relatedId: subRef.id,
      title: 'Pagamento de assinatura falhou',
      message: `O pagamento de ${sub.clientName} (${sub.planName}) falhou e a assinatura foi pausada pelo Mercado Pago.`,
    })
    await notify({
      type: 'payment_failed',
      targetUserId: sub.clientId,
      relatedId: subRef.id,
      title: 'Não conseguimos cobrar seu plano',
      message: `Houve uma falha no pagamento do plano "${sub.planName}". Verifique seu cartão.`,
    })
  } else if (preapproval.status === 'cancelled' && sub.status !== 'canceled') {
    await subRef.update({ status: 'canceled', canceledAt: FieldValue.serverTimestamp() })
  }
}

async function handlePayment(paymentId: string) {
  const payment = await paymentApi().get({ id: paymentId })
  const subscriptionId = payment.external_reference
  if (!subscriptionId) return

  const subRef = db.collection('subscriptions').doc(subscriptionId)
  const subSnap = await subRef.get()
  if (!subSnap.exists) return
  const sub = subSnap.data()!

  const status = payment.status === 'approved' ? 'approved' : payment.status === 'refunded' ? 'refunded' : 'rejected'

  await db.collection('payments').add({
    subscriptionId,
    clientId: sub.clientId,
    clientName: sub.clientName,
    amount: payment.transaction_amount ?? sub.planPrice,
    status,
    mpPaymentId: String(paymentId),
    description: `Assinatura ${sub.planName}`,
    paidAt: payment.date_approved ? new Date(payment.date_approved) : null,
    createdAt: FieldValue.serverTimestamp(),
  })

  if (status === 'approved') {
    const now = new Date()
    let nextPaymentDate: string | undefined
    if (sub.mpPreapprovalId) {
      try {
        const preapproval = await preApprovalApi().get({ id: sub.mpPreapprovalId })
        nextPaymentDate = preapproval.next_payment_date
      } catch {
        // segue com a estimativa de 30 dias abaixo
      }
    }
    await subRef.update({
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: nextPeriodEnd(nextPaymentDate, now),
      usage: {},
      expiringNotified: false,
    })
    await notify({
      type: 'payment_received',
      targetRole: 'owner',
      relatedId: subscriptionId,
      title: 'Pagamento recebido',
      message: `Pagamento de ${sub.clientName} confirmado (${sub.planName}).`,
    })
    await notify({
      type: 'payment_received',
      targetUserId: sub.clientId,
      relatedId: subscriptionId,
      title: 'Pagamento confirmado',
      message: `Recebemos o pagamento do seu plano "${sub.planName}". Obrigado!`,
    })
  } else if (status === 'rejected') {
    await subRef.update({ status: 'past_due' })
    await notify({
      type: 'payment_failed',
      targetRole: 'owner',
      relatedId: subscriptionId,
      title: 'Pagamento recusado',
      message: `O pagamento de ${sub.clientName} (${sub.planName}) foi recusado.`,
    })
    await notify({
      type: 'payment_failed',
      targetUserId: sub.clientId,
      relatedId: subscriptionId,
      title: 'Pagamento recusado',
      message: `O pagamento do seu plano "${sub.planName}" foi recusado. Atualize seus dados de cartão no Mercado Pago.`,
    })
  }
}
