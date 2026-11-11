import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'
import { checkPayment } from '../lib/infinitepay'
import { markInvoicePaid } from '../lib/billing'

/**
 * Webhook da InfinitePay (URL enviada em cada link: /api/infinitepay-webhook).
 *
 * O aviso não tem assinatura, então nunca confiamos no corpo: o pagamento só é
 * baixado depois de confirmado em /payment_check. Respostas não-2xx fazem a
 * InfinitePay reenviar — por isso devolvemos 200 para avisos que não nos
 * interessam e 400 só quando vale a pena tentar de novo.
 */
export const infinitePayWebhook = onRequest({ region: REGION }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('method not allowed')
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const orderNsu = typeof body.order_nsu === 'string' ? body.order_nsu : undefined
  const transactionNsu = body.transaction_nsu != null ? String(body.transaction_nsu) : undefined
  const slug = typeof body.invoice_slug === 'string' ? body.invoice_slug : undefined

  if (!orderNsu || !transactionNsu || !slug || orderNsu.includes('/')) {
    res.status(200).send('ignored')
    return
  }

  try {
    const invoice = await db.collection('invoices').doc(orderNsu).get()
    if (!invoice.exists) {
      logger.warn('Webhook InfinitePay para cobrança desconhecida', { orderNsu })
      res.status(200).send('unknown order')
      return
    }
    if (invoice.data()?.status === 'paid') {
      res.status(200).send('already paid')
      return
    }

    const check = await checkPayment({ orderNsu, transactionNsu, slug })
    if (!check.paid) {
      logger.warn('Webhook InfinitePay não confirmado no payment_check', { orderNsu, transactionNsu })
      res.status(200).send('not paid')
      return
    }

    await markInvoicePaid(orderNsu, {
      transactionNsu,
      slug,
      paidAmount: check.paidAmount,
      installments: check.installments,
      captureMethod: check.captureMethod,
      receiptUrl: typeof body.receipt_url === 'string' ? body.receipt_url : null,
    })
    res.status(200).send('ok')
  } catch (err) {
    logger.error('Erro processando webhook da InfinitePay', err)
    res.status(400).send('error')
  }
})
