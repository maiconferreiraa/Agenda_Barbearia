import { useMemo } from 'react'
import { collection, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from './useCollection'
import type { Subscription } from '../types'

/** Todas as assinaturas (visão do dono). */
export function useAllSubscriptions() {
  const q = useMemo(
    () => query(collection(db, 'subscriptions'), orderBy('createdAt', 'desc')),
    [],
  )
  return useCollection<Subscription>(q)
}

/** Assinatura(s) do cliente logado. */
export function useClientSubscriptions(clientId: string | undefined) {
  const q = useMemo(
    () =>
      clientId
        ? query(
            collection(db, 'subscriptions'),
            where('clientId', '==', clientId),
            orderBy('createdAt', 'desc'),
          )
        : null,
    [clientId],
  )
  return useCollection<Subscription>(q)
}
