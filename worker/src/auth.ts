import { createRemoteJWKSet, jwtVerify } from 'jose'
import { ApiError, type Env } from './env'

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

/** Confere o token de login do Firebase (Authorization: Bearer ...) e devolve o uid. */
export async function requireUid(request: Request, env: Env): Promise<string> {
  const header = request.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new ApiError('unauthenticated', 'Você precisa estar logado.')
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    })
    if (!payload.sub) throw new Error('sem sub')
    return payload.sub
  } catch {
    throw new ApiError('unauthenticated', 'Sessão expirada. Entre de novo.')
  }
}
