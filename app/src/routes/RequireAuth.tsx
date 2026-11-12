import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import type { Role } from '../types'

/** Página inicial de cada papel. */
export function homeFor(role: Role) {
  return role === 'owner' ? '/owner' : role === 'barber' ? '/barber' : '/app'
}

export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode
  role?: Role
}) {
  const { user, profile, loading } = useAuth()

  if (loading) return <Spinner full />
  if (!user || !profile) return <Navigate to="/login" replace />
  if (role && profile.role !== role) {
    return <Navigate to={homeFor(profile.role)} replace />
  }
  return <>{children}</>
}
