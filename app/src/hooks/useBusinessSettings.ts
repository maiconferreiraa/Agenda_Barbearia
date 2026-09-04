import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { DEFAULT_BUSINESS_HOURS } from '../lib/schedule'
import type { BusinessSettings } from '../types'

export const DEFAULT_SETTINGS: BusinessSettings = {
  name: 'Barbearia Primer',
  phone: '',
  address: '',
  slotDurationMinutes: 30,
  hours: DEFAULT_BUSINESS_HOURS,
  mercadoPagoConnected: false,
}

export function useBusinessSettings() {
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'businessSettings', 'main'), (snap) => {
      setSettings(snap.exists() ? { ...DEFAULT_SETTINGS, ...(snap.data() as BusinessSettings) } : DEFAULT_SETTINGS)
      setLoading(false)
    })
    return unsub
  }, [])

  return { settings, loading }
}
