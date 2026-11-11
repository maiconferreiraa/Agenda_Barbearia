import type { Env } from '../env'
import { Firestore } from '../firestore'
import { checkPayment, savedHandle } from '../infinitepay'
import { markInvoicePaid } from '../billing'

/**
 * Webhook da InfinitePay (POST /api/infinitepay-webhook, URL enviada em cada link).
 * Sem assinatura: só dá baixa depois de confirmar em /payment_check.
 * 200 para avisos que não interessam; 400 só quando vale a InfinitePay reenviar.
 */
export async function infinitePayWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  const orderNsu = typeof body.order_nsu === 'string' ? body.order_nsu : ''
  const transactionNsu = body.transaction_nsu != null ? String(body.transaction_nsu) : ''
  const slug = typeof body.invoice_slug === 'string' ? body.invoice_slug : ''
  if (!orderNsu || !transactionNsu || !slug || orderNsu.includes('/')) return new Response('ignored')

  try {
    const fs = new Firestore(env)
    const invoice = await fs.get(`invoices/${orderNsu}`)
    if (!invoice) return new Response('unknown order')
    if (invoice.data.status === 'paid') return new Response('already paid')

    const handle = await savedHandle(fs)
    if (!handle) return new Response('payments disabled')
    const check = await checkPayment({ handle, orderNsu, transactionNsu, slug })
    if (!check.paid) return new Response('not paid')

    await markInvoicePaid(env, fs, orderNsu, {
      transactionNsu,
      slug,
      ...check,
      receiptUrl: typeof body.receipt_url === 'string' ? body.receipt_url : null,
    })
    return new Response('ok')
  } catch (err) {
    console.error('Erro no webhook da InfinitePay', String(err))
    return new Response('error', { status: 400 })
  }
}
