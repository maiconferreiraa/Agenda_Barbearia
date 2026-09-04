import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Logo } from '../../components/Logo'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'

export function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register({ name, email, phone, password, inviteCode })
      navigate('/')
    } catch (err) {
      const code = (err as { code?: string }).code
      const message = (err as Error).message
      setError(
        code === 'auth/email-already-in-use'
          ? 'Este e-mail já está cadastrado.'
          : code === 'auth/weak-password'
            ? 'A senha precisa ter pelo menos 6 caracteres.'
            : message === 'Código do proprietário inválido.'
              ? 'Sua conta foi criada, mas o código do proprietário informado é inválido. Fale com quem administra o sistema, ou entre normalmente como cliente.'
              : 'Não foi possível criar sua conta. Tente novamente.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
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
          <Input
            label="Telefone / WhatsApp"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 91234-5678"
          />
          <Input
            label="Senha"
            type="password"
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
      </div>
    </div>
  )
}
