import { ApiError } from '../env'
import type { Ctx } from './ctx'

/** Cadastro com o código do proprietário vira "owner" (código só no servidor). */
export async function claimOwnerRole({ env, fs, uid, data }: Ctx) {
  const code = String(data.inviteCode ?? '')
  const expected = env.OWNER_INVITE_CODE ?? ''
  if (!expected || !code || !timingSafeEqual(code, expected)) {
    throw new ApiError('permission-denied', 'Código do proprietário inválido.')
  }
  const user = await fs.get(`users/${uid}`)
  if (!user) throw new ApiError('not-found', 'Usuário não encontrado.')
  await fs.update(user.path, { role: 'owner' })
  return { ok: true }
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
