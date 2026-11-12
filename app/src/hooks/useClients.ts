import { useMemo } from 'react'
import { collection, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from './useCollection'
import type { UserProfile } from '../types'

export function useClients(enabled = true) {
  const q = useMemo(
    () => (enabled ? query(collection(db, 'users'), where('role', '==', 'client'), orderBy('name')) : null),
    [enabled],
  )
  return useCollection<UserProfile>(q)
}
