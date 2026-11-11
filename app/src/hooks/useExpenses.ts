import { useMemo } from 'react'
import { collection, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from './useCollection'
import type { Expense } from '../types'

/** Todas as saídas cadastradas (são poucas; as fixas se repetem no cálculo do período). */
export function useExpenses() {
  const q = useMemo(() => query(collection(db, 'expenses'), orderBy('date', 'desc')), [])
  return useCollection<Expense>(q)
}
