import { useMemo } from 'react'
import { collection, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from './useCollection'
import type { UserProfile } from '../types'

export function useClients() {
  const q = useMemo(
    () => query(collection(db, 'users'), where('role', '==', 'client'), orderBy('name')),
    [],
  )
  return useCollection<UserProfile>(q)
}
