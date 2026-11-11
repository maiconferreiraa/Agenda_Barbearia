import { useMemo } from 'react'
import { collection, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from './useCollection'
import type { Payment } from '../types'

/** Pagamentos recebidos (mensalidades e upgrades) entre duas datas — visão do dono. */
export function usePaymentsRange(start: Date, end: Date) {
  const q = useMemo(
    () =>
      query(
        collection(db, 'payments'),
        where('paidAt', '>=', start),
        where('paidAt', '<=', end),
        orderBy('paidAt', 'asc'),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [start.getTime(), end.getTime()],
  )
  return useCollection<Payment>(q)
}
