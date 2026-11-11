import { SignJWT, importPKCS8 } from 'jose'
import type { Env } from './env'

/**
 * Token de acesso do Google a partir da conta de serviço do Firebase.
 * Serve para o Firestore (REST, ignora as regras como o Admin SDK) e o FCM.
 * Fica em memória até perto de expirar.
 */
let cached: { token: string; exp: number } | null = null

/** Contador de chamadas externas desta execução (limite de 50 no plano grátis). */
export const budget = { used: 0 }

export async function gfetch(input: string, init?: RequestInit): Promise<Response> {
  budget.used++
  return fetch(input, init)
}

export async function googleToken(env: Env): Promise<string> {
  if (cached && cached.exp - 60 > Date.now() / 1000) return cached.token

  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT) as { client_email: string; private_key: string }
  const key = await importPKCS8(sa.private_key, 'RS256')
  const now = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/cloud-platform' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)

  const res = await gfetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) throw new Error(`Google token falhou (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cached = { token: data.access_token, exp: now + data.expires_in }
  return cached.token
}
