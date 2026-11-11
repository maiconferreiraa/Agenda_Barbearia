import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { claimOwnerRoleFn, claimUsernameFn, loginWithUsernameFn, usernameAvailableFn } from '../lib/bookingApi'
import { auth, db } from '../firebase'
import type { UserProfile } from '../types'

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  register: (input: {
    name: string
    email: string
    phone: string
    password: string
    inviteCode?: string
    /** Usuário para entrar sem e-mail (ex.: maicon.ferreira). */
    username?: string
  }) => Promise<void>
  /** Aceita e-mail ou usuário (ex.: maicon.ferreira). */
  login: (emailOrUsername: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setAuthLoading(false)
      if (!u) {
        setProfile(null)
        setProfileLoading(false)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!user) return
    setProfileLoading(true)
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null)
      setProfileLoading(false)
    })
    return unsub
  }, [user])

  async function register(input: {
    name: string
    email: string
    phone: string
    password: string
    inviteCode?: string
    /** Usuário para entrar sem e-mail (ex.: maicon.ferreira). */
    username?: string
  }) {
    const username = input.username?.trim().toLowerCase()
    if (username) {
      const check = await usernameAvailableFn({ username })
      if (!check.data.available) {
        throw new Error(
          check.data.reason === 'invalid'
            ? 'Usuário inválido: use letras, números, ponto ou _ (3 a 30).'
            : 'Esse usuário já existe. Escolha outro.',
        )
      }
    }
    const cred = await createUserWithEmailAndPassword(
      auth,
      input.email,
      input.password,
    )
    await updateProfile(cred.user, { displayName: input.name })
    // Todo cadastro nasce como cliente; com o código do proprietário, o
    // servidor (claimOwnerRole) promove a conta — o código nunca fica no app.
    const newProfile: UserProfile = {
      uid: cred.user.uid,
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: 'client',
    }
    await setDoc(doc(db, 'users', cred.user.uid), {
      ...newProfile,
      createdAt: serverTimestamp(),
    })
    if (username) {
      try {
        await claimUsernameFn({ username })
      } catch (err) {
        throw new Error(`Conta criada! Mas o usuário não foi salvo (${(err as Error).message}) — entre com seu e-mail.`)
      }
    }
    const inviteCode = input.inviteCode?.trim()
    if (inviteCode) {
      try {
        await claimOwnerRoleFn({ inviteCode })
      } catch (err) {
        throw new Error(
          `Conta criada como cliente — ${(err as Error).message} Peça o código correto e fale com o suporte.`,
        )
      }
    }
  }

  async function login(emailOrUsername: string, password: string) {
    const id = emailOrUsername.trim()
    if (id.includes('@')) {
      await signInWithEmailAndPassword(auth, id, password)
      return
    }
    const res = await loginWithUsernameFn({ username: id.toLowerCase(), password })
    await signInWithCustomToken(auth, res.data.token)
  }

  async function logout() {
    await signOut(auth)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading: authLoading || (!!user && profileLoading),
        register,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
