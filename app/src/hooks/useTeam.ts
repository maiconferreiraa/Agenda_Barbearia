import { useMemo } from 'react'
import { collection, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from './useCollection'
import type { UserProfile } from '../types'

/** Quem atende (dono com "Eu também atendo" + colaboradores ativos) — só o dono lê. */
export function useBarbers(enabled = true) {
  const q = useMemo(() => (enabled ? query(collection(db, 'users'), where('attends', '==', true)) : null), [enabled])
  const res = useCollection<UserProfile>(q)
  const data = res.data
    .filter((u) => (u.role === 'owner' || u.role === 'barber') && u.active !== false)
    .sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || a.name.localeCompare(b.name, 'pt-BR'))
  return { ...res, data }
}

/** Toda a equipe (donos e colaboradores, inclusive desativados) — tela Equipe. */
export function useTeam() {
  const q = useMemo(() => query(collection(db, 'users'), where('role', 'in', ['owner', 'barber'])), [])
  return useCollection<UserProfile>(q)
}
