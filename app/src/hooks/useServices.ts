import { useMemo } from 'react'
import { collection, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from './useCollection'
import type { ServiceItem } from '../types'

export function useServices(opts: { onlyActive?: boolean } = {}) {
  const q = useMemo(() => {
    const base = collection(db, 'services')
    return opts.onlyActive
      ? query(base, where('active', '==', true), orderBy('name'))
      : query(base, orderBy('name'))
  }, [opts.onlyActive])

  return useCollection<ServiceItem>(q)
}
