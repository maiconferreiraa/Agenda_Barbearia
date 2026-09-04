import { createHmac } from 'crypto'

/**
 * Valida o header "x-signature" enviado pelo Mercado Pago nos webhooks,
 * conforme https://www.mercadopago.com.br/developers -> Webhooks -> Assinatura.
 * Se nenhum segredo estiver configurado, a validação é ignorada (modo permissivo
 * para ambiente de desenvolvimento) — configure MP_WEBHOOK_SECRET em produção.
 */
export function isValidMpSignature(params: {
  xSignature: string | undefined
  xRequestId: string | undefined
  dataId: string | undefined
  secret: string
}): boolean {
  const { xSignature, xRequestId, dataId, secret } = params
  if (!secret) return true
  if (!xSignature || !xRequestId || !dataId) return false

  const parts = Object.fromEntries(
    xSignature.split(',').map((p) => {
      const [k, v] = p.split('=')
      return [k.trim(), (v ?? '').trim()]
    }),
  )
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')
  return expected === v1
}
