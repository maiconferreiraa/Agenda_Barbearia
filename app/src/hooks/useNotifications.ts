import { useMemo } from 'react'
import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from './useCollection'
import type { AppNotification, Role } from '../types'

export function useNotifications(role: Role | undefined, userId: string | undefined) {
  const q = useMemo(() => {
    if (!role || !userId) return null
    return role === 'owner'
      ? query(
          collection(db, 'notifications'),
          where('targetRole', '==', 'owner'),
          orderBy('createdAt', 'desc'),
          limit(50),
        )
      : query(
          collection(db, 'notifications'),
          where('targetUserId', '==', userId),
          orderBy('createdAt', 'desc'),
          limit(50),
        )
  }, [role, userId])

  return useCollection<AppNotification>(q)
}
