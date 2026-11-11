import { defineSecret, defineString } from 'firebase-functions/params'

/** InfiniteTag da conta InfinitePay que recebe as mensalidades, sem o "$". */
export const INFINITEPAY_HANDLE = defineString('INFINITEPAY_HANDLE')

/** URL pública do PWA publicado, sem barra no final. */
export const APP_BASE_URL = defineString('APP_BASE_URL', {
  default: 'https://barbearia-prime-app.web.app',
})

/**
 * Código secreto que promove um cadastro a "proprietário". Fica só no servidor
 * (Cloud Functions) — nunca no bundle do app — para que não possa ser lido no
 * navegador e usado por qualquer pessoa para virar dono da barbearia.
 */
export const OWNER_INVITE_CODE = defineSecret('OWNER_INVITE_CODE')
