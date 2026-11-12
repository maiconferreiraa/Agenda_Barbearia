import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Logo } from '../../components/Logo'
import { ThemeToggle } from '../../components/ThemeToggle'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { PasswordInput } from '../../components/ui/PasswordInput'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { PHONE_RULE, isValidPhone } from '../../lib/phone'
import { USERNAME_RULE, suggestUsername, usernameAvailableFn } from '../../lib/bookingApi'

type UsernameState = 'idle' | 'checking' | 'free' | 'taken' | 'invalid'

export function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [username, setUsername] = useState('')
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [usernameState, setUsernameState] = useState<UsernameState>('idle')

  // Sugere o usuário a partir do nome até a pessoa mexer no campo.
  useEffect(() => {
    if (!usernameTouched) setUsername(suggestUsername(name))
  }, [name, usernameTouched])

  // Confere se o usuário está livre (com uma pausa enquanto digita).
  useEffect(() => {
    const u = username.trim().toLowerCase()
    if (!u) return setUsernameState('idle')
    if (!USERNAME_RULE.test(u) || u.includes('..')) return setUsernameState('invalid')
    setUsernameState('checking')
    const t = setTimeout(() => {
      usernameAvailableFn({ username: u })
        .then((r) => setUsernameState(r.data.available ? 'free' : 'taken'))
        .catch(() => setUsernameState('idle'))
    }, 500)
    return () => clearTimeout(t)
  }, [username])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (!isValidPhone(phone)) throw new Error(`Telefone inválido. ${PHONE_RULE}`)
      if (usernameState === 'taken') throw new Error('Esse usuário já existe. Escolha outro.')
      if (usernameState === 'invalid') throw new Error('Usuário inválido: use letras, números, ponto ou _ (3 a 30).')
      await register({ name, email, phone, password, inviteCode, username: username.trim() || undefined })
      navigate('/')
    } catch (err) {
      const code = (err as { code?: string }).code
      const message = (err as Error).message
      setError(
        code === 'auth/email-already-in-use'
          ? 'Este e-mail já está cadastrado.'
          : code === 'auth/weak-password'
            ? 'A senha precisa ter pelo menos 6 caracteres.'
            : code === 'auth/invalid-email'
              ? 'E-mail inválido.'
              : !code && message
                ? message
                : 'Não foi possível criar sua conta. Tente novamente.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <ThemeToggle className="absolute right-3 top-3" />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-ink-border bg-ink-card/50 p-6">
          <h1 className="text-center font-display text-xl text-neutral-100">Criar conta</h1>
          <Input label="Nome" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="E-mail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div>
            <Input
              label="Usuário (para entrar sem o e-mail)"
              value={username}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => {
                setUsernameTouched(true)
                setUsername(e.target.value.toLowerCase().replace(/\s+/g, '.'))
              }}
              placeholder="maicon.ferreira"
            />
            <p
              className={`mt-1 text-xs ${
                usernameState === 'free'
                  ? 'text-emerald-400'
                  : usernameState === 'taken' || usernameState === 'invalid'
                    ? 'text-red-400'
                    : 'text-neutral-500'
              }`}
            >
              {usernameState === 'free' && '✓ Disponível'}
              {usernameState === 'taken' && '✗ Já existe — escolha outro'}
              {usernameState === 'invalid' && 'Use letras, números, ponto ou _ (3 a 30)'}
              {usernameState === 'checking' && 'Conferindo…'}
              {usernameState === 'idle' && 'Você vai poder entrar com o usuário ou com o e-mail.'}
            </p>
          </div>
          <PhoneInput required value={phone} onChange={setPhone} />
          <PasswordInput
            label="Senha"
            autoComplete="new-password"
            hint="Mínimo de 6 caracteres."
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="Código do proprietário (opcional)"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            hint="Só preencha se você for o dono da barbearia."
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            Criar conta
          </Button>
          <p className="text-center text-sm text-neutral-500">
            Já tem conta?{' '}
            <Link to="/login" className="text-gold-light hover:underline">
              Entrar
            </Link>
          </p>
        </form>
        <Link
          to="/agendar"
          className="mt-4 block rounded-2xl border border-ink-border bg-ink-card/50 p-4 text-center hover:border-gold-dark"
        >
          <p className="text-sm font-medium text-neutral-100">Prefere não se cadastrar?</p>
          <p className="text-xs text-neutral-500">Marque seu horário só com nome e telefone →</p>
        </Link>
      </div>
    </div>
  )
}
