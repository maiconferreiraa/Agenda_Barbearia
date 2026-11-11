import { logger } from 'firebase-functions/v2'
import { db } from './admin'

/**
 * Cliente mínimo do Checkout Integrado da InfinitePay
 * (https://www.infinitepay.io/checkout-documentacao).
 *
 * A API só gera links de pagamento avulsos — não existe cobrança recorrente.
 * Por isso a mensalidade é um link novo por mês (ver lib/billing.ts).
 * O webhook não tem assinatura: todo aviso é confirmado em /payment_check.
 */
const BASE_URL = 'https://api.checkout.infinitepay.io'

/** Onde o dono salva a InfiniteTag (Configurações → Pagamentos). */
export const PAYMENT_SETTINGS_DOC = db.collection('businessSettings').doc('pagamento')

/**
 * Aceita a InfiniteTag do jeito que o dono colar: "$barbeariaprime",
 * "@barbeariaprime", "barbeariaprime" ou um link como
 * "https://loja.infinitepay.io/barbeariaprime". Devolve só o nome, ou null.
 */
export function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let h = raw.trim()
  if (/infinitepay\.io/i.test(h)) {
    h = h.replace(/^https?:\/\//i, '').split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? ''
  }
  h = h.replace(/^[$@]/, '').trim().toLowerCase()
  return /^[a-z0-9._-]{2,40}$/.test(h) ? h : null
}

/** InfiniteTag salva pelo dono. */
async function handle(): Promise<string> {
  const snap = await PAYMENT_SETTINGS_DOC.get()
  const h = normalizeHandle(snap.data()?.infinitePayHandle)
  if (!h) throw new Error('InfiniteTag não configurada (Configurações → Pagamentos).')
  return h
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    // resposta não-JSON: cai no erro abaixo com o texto bruto
  }
  if (!res.ok) {
    logger.error('InfinitePay respondeu com erro', { path, status: res.status, body: text.slice(0, 500) })
    throw new Error(`InfinitePay ${path} falhou (${res.status})`)
  }
  return data
}

export interface CheckoutLinkInput {
  /** Nosso id da cobrança — volta no webhook como order_nsu. */
  orderNsu: string
  /** Valor em reais (ex.: 89.9). */
  amount: number
  description: string
  customer?: { name?: string; email?: string; phone_number?: string }
  redirectUrl?: string
  webhookUrl?: string
  /** Só para o teste de conexão (antes de salvar); no resto usa a InfiniteTag salva. */
  handle?: string
}

/** Cria um link de pagamento e devolve a URL do checkout. */
export async function createCheckoutLink(input: CheckoutLinkInput): Promise<string> {
  const priceCents = Math.round(input.amount * 100)
  if (priceCents < 100) throw new Error('A InfinitePay exige valor mínimo de R$ 1,00.')

  const data = await post('/links', {
    handle: input.handle ?? (await handle()),
    order_nsu: input.orderNsu,
    ...(input.redirectUrl ? { redirect_url: input.redirectUrl } : {}),
    ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
    items: [{ quantity: 1, price: priceCents, description: input.description }],
    ...(input.customer ? { customer: input.customer } : {}),
  })

  // O formato da resposta não está documentado; aceita os nomes mais prováveis.
  const url = [data.url, data.link, data.checkout_url, data.payment_url].find(
    (v): v is string => typeof v === 'string' && v.startsWith('http'),
  )
  if (!url) {
    logger.error('Resposta da InfinitePay sem URL de checkout', { data })
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

/** Confirma na InfinitePay se o pagamento existe e foi pago. */
export async function checkPayment(input: {
  orderNsu: string
  transactionNsu: string
  slug: string
}): Promise<PaymentCheckResult> {
  const data = await post('/payment_check', {
    handle: await handle(),
    order_nsu: input.orderNsu,
    transaction_nsu: input.transactionNsu,
    slug: input.slug,
  })
  const paidAmount = typeof data.paid_amount === 'number' ? data.paid_amount / 100 : null
  return {
    paid: data.success === true && data.paid === true,
    paidAmount,
    installments: typeof data.installments === 'number' ? data.installments : null,
    captureMethod: typeof data.capture_method === 'string' ? data.capture_method : null,
  }
}
