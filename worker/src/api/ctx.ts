import { ApiError, type Env } from '../env'
import type { Data, Firestore } from '../firestore'

export interface Ctx {
  env: Env
  fs: Firestore
  uid: string
  data: Data
}

export async function requireOwner({ fs, uid }: Ctx) {
  const user = await fs.get(`users/${uid}`)
  if (user?.data.role !== 'owner') {
    throw new ApiError('permission-denied', 'Apenas o proprietário pode fazer isso.')
  }
  return user
}
