import { useEffect, useState } from 'react'
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore'
import { db } from '../firebase'

export interface PaymentSettings {
  infinitePayHandle: string | null
  connectedAt?: Timestamp | null
}

/** InfiniteTag salva pelo dono (businessSettings/pagamento). */
export function usePaymentSettings() {
  const [settings, setSettings] = useState<PaymentSettings>({ infinitePayHandle: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'businessSettings', 'pagamento'),
      (snap) => {
        setSettings({ infinitePayHandle: null, ...(snap.data() as Partial<PaymentSettings>) })
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsub
  }, [])

  return { settings, loading }
}
