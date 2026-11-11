import type { Firestore } from './firestore'
import { gfetch } from './google'

/**
 * Checkout Integrado da InfinitePay (https://www.infinitepay.io/checkout-documentacao).
 * Só gera links avulsos — por isso uma cobrança por mês. O webhook não tem
 * assinatura: todo aviso é confirmado em /payment_check.
 */
const BASE_URL = 'https://api.checkout.infinitepay.io'
export const PAYMENT_SETTINGS = 'businessSettings/pagamento'

/** Aceita "$tag", "@tag", "tag" ou o link da loja; devolve só o nome, ou null. */
export function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let h = raw.trim()
  if (/infinitepay\.io/i.test(h)) {
    h = h.replace(/^https?:\/\//i, '').split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? ''
  }
  h = h.replace(/^[$@]/, '').trim().toLowerCase()
  return /^[a-z0-9._-]{2,40}$/.test(h) ? h : null
}

export async function savedHandle(fs: Firestore): Promise<string | null> {
  const doc = await fs.get(PAYMENT_SETTINGS)
  return normalizeHandle(doc?.data.infinitePayHandle)
}

/** Erro da API com o código que a InfinitePay devolve (ex.: external_checkout_not_enabled). */
export class InfinitePayError extends Error {
  constructor(public path: string, public status: number, public code: string) {
    super(`InfinitePay ${path} falhou (${status}${code ? `: ${code}` : ''})`)
  }
}

/** Onde o dono liga o Checkout Integrado na conta InfinitePay. */
export const ENABLE_CHECKOUT_URL = 'https://app.infinitepay.io/external-checkout#configuracoes?enabled=true'

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await gfetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    /* resposta não-JSON */
  }
  if (!res.ok) {
    console.error('InfinitePay erro', path, res.status, text.slice(0, 500))
    throw new InfinitePayError(path, res.status, typeof data.error === 'string' ? data.error : '')
  }
  return data
}

export interface CheckoutLinkInput {
  handle: string
  orderNsu: string
  /** Em reais (ex.: 89.9). */
  amount: number
  description: string
  customer?: { name?: string; email?: string; phone_number?: string }
  redirectUrl?: string
  webhookUrl?: string
}

export async function createCheckoutLink(input: CheckoutLinkInput): Promise<string> {
  const priceCents = Math.round(input.amount * 100)
  if (priceCents < 100) throw new Error('A InfinitePay exige valor mínimo de R$ 1,00.')
  const data = await post('/links', {
    handle: input.handle,
    order_nsu: input.orderNsu,
    ...(input.redirectUrl ? { redirect_url: input.redirectUrl } : {}),
    ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
    items: [{ quantity: 1, price: priceCents, description: input.description }],
    ...(input.customer ? { customer: input.customer } : {}),
  })
  // Formato da resposta não documentado: aceita os nomes mais prováveis.
  const url = [data.url, data.link, data.checkout_url, data.payment_url].find(
    (v): v is string => typeof v === 'string' && v.startsWith('http'),
  )
  if (!url) {
    console.error('InfinitePay sem URL de checkout', JSON.stringify(data).slice(0, 500))
    throw new Error('InfinitePay não devolveu o link de pagamento.')
  }
  return url
}

export interface PaymentCheckResult {
  paid: boolean
  paidAmount: number | null
  installments: number | null
  captureMethod: string | null
}

export async function checkPayment(input: {
  handle: string
  orderNsu: string
  transactionNsu: string
  slug: string
}): Promise<PaymentCheckResult> {
  const data = await post('/payment_check', {
    handle: input.handle,
    order_nsu: input.orderNsu,
    transaction_nsu: input.transactionNsu,
    slug: input.slug,
  })
  return {
    paid: data.success === true && data.paid === true,
    paidAmount: typeof data.paid_amount === 'number' ? data.paid_amount / 100 : null,
    installments: typeof data.installments === 'number' ? data.installments : null,
    captureMethod: typeof data.capture_method === 'string' ? data.capture_method : null,
  }
}
