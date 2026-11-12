import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Logo } from '../../components/Logo'
import { ThemeToggle } from '../../components/ThemeToggle'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { PasswordInput } from '../../components/ui/PasswordInput'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      const msg = (err as Error).message ?? ''
      setError(msg.includes('Muitas tentativas') ? msg : 'Usuário/e-mail ou senha inválidos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-ink px-4">
      <ThemeToggle className="absolute right-3 top-3" />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-ink-border bg-ink-card/50 p-6">
          <h1 className="text-center font-display text-xl text-neutral-100">Entrar</h1>
          <Input
            label="E-mail ou usuário"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com ou maicon.ferreira"
          />
          <PasswordInput
            label="Senha"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            Entrar
          </Button>
          <p className="text-center text-sm text-neutral-500">
            Não tem conta?{' '}
            <Link to="/register" className="text-gold-light hover:underline">
              Cadastre-se
            </Link>
          </p>
        </form>
        <Link
          to="/agendar"
          className="mt-4 block rounded-2xl border border-ink-border bg-ink-card/50 p-4 text-center hover:border-gold-dark"
        >
          <p className="text-sm font-medium text-neutral-100">Só quer marcar um horário?</p>
          <p className="text-xs text-neutral-500">Agende sem cadastro, só com nome e telefone →</p>
        </Link>
      </div>
    </div>
  )
}
