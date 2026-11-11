import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'
import { checkPayment } from '../lib/infinitepay'
import { markInvoicePaid } from '../lib/billing'

/**
 * Reserva do webhook: quando o cliente volta do checkout, a InfinitePay põe
 * order_nsu, transaction_nsu e slug na URL. O app chama esta função com eles
 * e o pagamento é baixado na hora (confirmado em /payment_check), mesmo que o
 * webhook atrase ou falhe.
 */
export const confirmInvoicePayment = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Você precisa estar logado.')

  const orderNsu = String(request.data?.orderNsu ?? '')
  const transactionNsu = String(request.data?.transactionNsu ?? '')
  const slug = String(request.data?.slug ?? '')
  if (!orderNsu || !transactionNsu || !slug || orderNsu.includes('/')) {
    throw new HttpsError('invalid-argument', 'Dados do pagamento incompletos.')
  }

  const invoice = await db.collection('invoices').doc(orderNsu).get()
  if (!invoice.exists || invoice.data()?.clientId !== uid) {
    throw new HttpsError('not-found', 'Cobrança não encontrada.')
  }
  if (invoice.data()?.status === 'paid') return { paid: true }

  const check = await checkPayment({ orderNsu, transactionNsu, slug })
  if (!check.paid) return { paid: false }

  await markInvoicePaid(orderNsu, {
    transactionNsu,
    slug,
    paidAmount: check.paidAmount,
    installments: check.installments,
    captureMethod: check.captureMethod,
  })
  return { paid: true }
})
