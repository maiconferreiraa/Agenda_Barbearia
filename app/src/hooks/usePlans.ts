import { useMemo } from 'react'
import { collection, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from './useCollection'
import type { Plan } from '../types'

export function usePlans(opts: { onlyActive?: boolean } = {}) {
  const q = useMemo(() => {
    const base = collection(db, 'plans')
    return opts.onlyActive
      ? query(base, where('active', '==', true), orderBy('price'))
      : query(base, orderBy('price'))
  }, [opts.onlyActive])

  return useCollection<Plan>(q)
}
