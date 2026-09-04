import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { db } from '../lib/admin'
import { OWNER_INVITE_CODE } from '../lib/params'
import { REGION } from '../lib/region'

/**
 * Promove o usuário autenticado a "owner" se ele informar o código correto.
 * A comparação acontece só no servidor para o código nunca ficar exposto no app.
 */
export const claimOwnerRole = onCall(
  { region: REGION, secrets: [OWNER_INVITE_CODE] },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Você precisa estar logado.')

    const inviteCode = request.data?.inviteCode as string | undefined
    const expected = OWNER_INVITE_CODE.value()

    if (!expected || !inviteCode || inviteCode !== expected) {
      throw new HttpsError('permission-denied', 'Código do proprietário inválido.')
    }

    await db.collection('users').doc(uid).update({ role: 'owner' })
    return { ok: true as const }
  },
)
