import { defineSecret, defineString } from 'firebase-functions/params'

/** Access Token do Mercado Pago (Credenciais > Access Token de produção ou teste). */
export const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN')

/** Chave secreta do webhook, gerada em Suas integrações > Webhooks, no painel do Mercado Pago. */
export const MP_WEBHOOK_SECRET = defineSecret('MP_WEBHOOK_SECRET')

/** URL pública do PWA publicado, sem barra no final. */
export const APP_BASE_URL = defineString('APP_BASE_URL', {
  default: 'https://barbearia-primer.web.app',
})

/**
 * Código secreto que promove um cadastro a "proprietário". Fica só no servidor
 * (Cloud Functions) — nunca no bundle do app — para que não possa ser lido no
 * navegador e usado por qualquer pessoa para virar dono da barbearia.
 */
export const OWNER_INVITE_CODE = defineSecret('OWNER_INVITE_CODE')
