import { SignJWT, importPKCS8 } from 'jose'
import { ApiError, type Env } from '../env'
import type { Firestore } from '../firestore'
import { gfetch } from '../google'
import type { Ctx } from './ctx'

/**
 * Login por usuário (ex.: maicon.ferreira). O e-mail nunca sai do servidor:
 * o app manda usuário + senha, o servidor acha o e-mail, confere a senha no
 * Firebase Auth e devolve um "custom token" para o app entrar.
 *
 * Reserva: `usernames/{usuario}` = { uid } (o id do documento garante que é único).
 */

/** minúsculas, letras/números/ponto/sublinhado, 3–30 caracteres, sem ponto nas pontas. */
export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const u = raw.trim().toLowerCase()
  return /^[a-z0-9](?:[a-z0-9._]{1,28})[a-z0-9]$/.test(u) && !u.includes('..') ? u : null
}

async function isTaken(fs: Firestore, username: string) {
  return !!(await fs.get(`usernames/${username}`))
}

/** POST /api/usernameAvailable { username } — sem login (só diz se está livre). */
export async function usernameAvailable(fs: Firestore, data: Record<string, unknown>) {
  const username = normalizeUsername(data.username)
  if (!username) return { available: false, reason: 'invalid' }
  return { available: !(await isTaken(fs, username)) }
}

/** POST /api/claimUsername { username } — com login: reserva o usuário para a conta. */
export async function claimUsername({ fs, uid, data }: Ctx) {
  const username = normalizeUsername(data.username)
  if (!username) {
    throw new ApiError('invalid-argument', 'Usuário inválido: use letras, números, ponto ou _ (3 a 30).')
  }
  await fs.runTransaction(async (tx) => {
    const taken = await tx.get(`usernames/${username}`)
    if (taken && taken.data.uid !== uid) throw new ApiError('already-exists', 'Esse usuário já existe. Escolha outro.')
    const user = await tx.get(`users/${uid}`)
    const previous = user?.data.username as string | undefined
    if (previous && previous !== username) {
      throw new ApiError('failed-precondition', 'Sua conta já tem um usuário.')
    }
    if (!taken) tx.create(`usernames/${username}`, { uid, createdAt: new Date() })
    if (user) tx.update(`users/${uid}`, { username })
  })
  return { username }
}

/** Custom token do Firebase Auth assinado com a conta de serviço. */
async function customToken(env: Env, uid: string) {
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT) as { client_email: string; private_key: string }
  const key = await importPKCS8(sa.private_key, 'RS256')
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)
}

const WRONG = 'Usuário ou senha inválidos.'

/** POST /api/loginWithUsername { username, password } — sem login. */
export async function loginWithUsername(env: Env, fs: Firestore, data: Record<string, unknown>) {
  const username = normalizeUsername(data.username)
  const password = typeof data.password === 'string' ? data.password : ''
  if (!username || !password) throw new ApiError('unauthenticated', WRONG)

  const reserved = await fs.get(`usernames/${username}`)
  const uid = reserved?.data.uid as string | undefined
  const user = uid ? await fs.get(`users/${uid}`) : null
  const email = user?.data.email as string | undefined
  if (!uid || !email) throw new ApiError('unauthenticated', WRONG)

  // Confere a senha no próprio Firebase Auth (o servidor não guarda senhas).
  const res = await gfetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    },
  )
  if (!res.ok) {
    const body = await res.text()
    if (body.includes('TOO_MANY_ATTEMPTS')) {
      throw new ApiError('failed-precondition', 'Muitas tentativas. Espere alguns minutos e tente de novo.')
    }
    throw new ApiError('unauthenticated', WRONG)
  }
  const ok = (await res.json()) as { localId?: string }
  if (ok.localId !== uid) throw new ApiError('unauthenticated', WRONG)

  return { token: await customToken(env, uid) }
}
