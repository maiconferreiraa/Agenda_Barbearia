import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import type { FeeSettings } from '../types'

const FEES_DOC = doc(db, 'ownerSettings', 'taxas')

/** Taxas da InfinitePay (só o dono lê e grava — o cliente não tem acesso). */
export function useFeeSettings() {
  const [fees, setFees] = useState<FeeSettings>({})
  const [loading, setLoading] = useState(true)
  useEffect(
    () =>
      onSnapshot(
        FEES_DOC,
        (snap) => {
          setFees((snap.data() as FeeSettings) ?? {})
          setLoading(false)
        },
        () => setLoading(false),
      ),
    [],
  )
  return { fees, loading }
}

export function saveFeeSettings(fees: FeeSettings) {
  return setDoc(
    FEES_DOC,
    { feePixPercent: fees.feePixPercent ?? null, feeCardPercent: fees.feeCardPercent ?? null },
    { merge: true },
  )
}
