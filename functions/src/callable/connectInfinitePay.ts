import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'
import { PAYMENT_SETTINGS_DOC, createCheckoutLink, normalizeHandle } from '../lib/infinitepay'

/**
 * Dono cola a InfiniteTag em Configurações → Pagamentos e toca "Conectar".
 * Testamos criando um link de R$ 1,00 (ninguém paga; serve só para ver se a
 * InfinitePay aceita a InfiniteTag) e, se der certo, salvamos.
 */
export const connectInfinitePay = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Você precisa estar logado.')
  const user = await db.collection('users').doc(uid).get()
  if (user.data()?.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Apenas o proprietário pode configurar pagamentos.')
  }

  if (request.data?.disconnect === true) {
    await PAYMENT_SETTINGS_DOC.set({ infinitePayHandle: null, connectedAt: null }, { merge: true })
    return { handle: null }
  }

  const handle = normalizeHandle(request.data?.handle)
  if (!handle) {
    throw new HttpsError(
      'invalid-argument',
      'InfiniteTag inválida. Ela aparece no app da InfinitePay e começa com $ (ex.: $barbeariaprime).',
    )
  }

  try {
    await createCheckoutLink({
      handle,
      orderNsu: `teste-conexao-${Date.now()}`,
      amount: 1,
      description: 'Teste de conexão - Barbearia Prime',
    })
  } catch (err) {
    logger.warn('Teste de conexão com a InfinitePay falhou', { handle, err: String(err) })
    throw new HttpsError(
      'failed-precondition',
      'A InfinitePay não aceitou essa InfiniteTag. Confira no app da InfinitePay e tente de novo.',
    )
  }

  await PAYMENT_SETTINGS_DOC.set(
    { infinitePayHandle: handle, connectedAt: FieldValue.serverTimestamp(), connectedBy: uid },
    { merge: true },
  )
  return { handle }
})
