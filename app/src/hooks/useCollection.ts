import { useEffect, useState } from 'react'
import { onSnapshot, type Query } from 'firebase/firestore'

/** Assina uma query do Firestore em tempo real e devolve os dados sempre sincronizados. */
export function useCollection<T>(query: Query | null) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!query) {
      setData([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      query,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T))
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return { data, loading, error }
}
