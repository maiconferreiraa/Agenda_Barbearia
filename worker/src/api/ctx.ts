import { ApiError, type Env } from '../env'
import type { Data, Firestore } from '../firestore'

export interface Ctx {
  env: Env
  fs: Firestore
  uid: string
  data: Data
}

/** Dono ou colaborador ativo (quem atende na barbearia). */
export async function requireStaff({ fs, uid }: Ctx) {
  const user = await fs.get(`users/${uid}`)
  const role = user?.data.role
  if (!user || !(role === 'owner' || (role === 'barber' && user.data.active !== false))) {
    throw new ApiError('permission-denied', 'Apenas a equipe da barbearia pode fazer isso.')
  }
  return { user, isOwner: role === 'owner' }
}

export async function requireOwner({ fs, uid }: Ctx) {
  const user = await fs.get(`users/${uid}`)
  if (user?.data.role !== 'owner') {
    throw new ApiError('permission-denied', 'Apenas o proprietário pode fazer isso.')
  }
  return user
}
