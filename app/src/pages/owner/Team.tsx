import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { PasswordInput } from '../../components/ui/PasswordInput'
import { Spinner } from '../../components/ui/Spinner'
import { useAuth } from '../../contexts/AuthContext'
import { useTeam } from '../../hooks/useTeam'
import { USERNAME_RULE, suggestUsername } from '../../lib/bookingApi'
import { isValidPhone } from '../../lib/phone'
import { createCollaboratorFn, setCollaboratorPasswordFn, updateTeamMemberFn } from '../../lib/paymentsApi'
import type { UserProfile } from '../../types'

/**
 * Equipe: quem atende na barbearia. O dono cadastra colaboradores (cada um com
 * usuário e senha próprios e % de comissão) e marca se ele mesmo também atende.
 */
export function Team() {
  const { profile } = useAuth()
  const { data: team, loading } = useTeam()
  const [adding, setAdding] = useState(false)
  const [pwFor, setPwFor] = useState<UserProfile | null>(null)
  const owners = team.filter((u) => u.role === 'owner')
  const barbers = team.filter((u) => u.role === 'barber').sort((a, b) => Number(b.active !== false) - Number(a.active !== false))

  async function update(id: string, patch: { attends?: boolean; commissionPercent?: number; active?: boolean }) {
    try {
      await updateTeamMemberFn({ id, ...patch })
    } catch (err) {
      alert((err as Error).message)
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-neutral-100">Equipe</h1>
        <Button onClick={() => setAdding(true)} className="!px-3 !py-1.5 text-sm">
          + Novo colaborador
        </Button>
      </div>
      <Card className="text-sm text-neutral-400">
        Cada colaborador entra com o <b>usuário e a senha</b> dele e vê <b>só a agenda, os clientes e a produção dele</b>.
        Você vê tudo: a agenda de cada um, e em <b>Financeiro → Equipe</b> quanto cada um produziu e a comissão a pagar.
        Na hora de marcar, o cliente escolhe o barbeiro (ou "sem preferência").
      </Card>

      {loading && <Spinner full />}

      {profile?.role === 'owner' && (
        <Card className="space-y-2">
          <h2 className="font-display text-base text-gold-light">Dono</h2>
          {owners
            .filter((o) => o.uid === profile.uid)
            .map((o) => (
              <label key={o.uid} className="flex items-center justify-between gap-3 text-sm text-neutral-200">
                <span>
                  <b>{o.name}</b> — eu também atendo clientes (tenho agenda própria)
                </span>
                <input type="checkbox" checked={!!o.attends} onChange={(e) => update(o.uid, { attends: e.target.checked })} />
              </label>
            ))}
          <p className="text-xs text-neutral-500">
            Desligado: você só administra. Se nenhum barbeiro estiver cadastrado, a agenda funciona como uma só.
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {barbers.length === 0 && !loading && (
          <Card className="text-center text-sm text-neutral-500">Nenhum colaborador ainda. Toque em "+ Novo colaborador".</Card>
        )}
        {barbers.map((b) => (
          <Card key={b.uid} className={`space-y-2 ${b.active === false ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-neutral-100">
                  {b.name} {b.active === false && <span className="text-xs text-red-400">(desativado)</span>}
                </p>
                <p className="text-xs text-neutral-500">
                  usuário <b>{b.username}</b> · {b.phone}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                Comissão
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  defaultValue={b.commissionPercent ?? 0}
                  onBlur={(e) => Number(e.target.value) !== (b.commissionPercent ?? 0) && update(b.uid, { commissionPercent: Number(e.target.value) })}
                  className="w-16 rounded-md border border-ink-border bg-ink-soft px-2 py-1 text-right text-sm text-neutral-100"
                />
                %
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setPwFor(b)} className="!px-2.5 !py-1.5 text-xs">
                Trocar senha
              </Button>
              {b.active === false ? (
                <Button variant="secondary" onClick={() => update(b.uid, { active: true })} className="!px-2.5 !py-1.5 text-xs">
                  Reativar
                </Button>
              ) : (
                <Button
                  variant="danger"
                  onClick={() =>
                    confirm(`Desativar ${b.name}? Ele não entra mais no app e sai da lista de barbeiros. Os horários já marcados com ele continuam na agenda — remarque se precisar.`) &&
                    update(b.uid, { active: false })
                  }
                  className="!px-2.5 !py-1.5 text-xs"
                >
                  Desativar
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <AddCollaborator open={adding} onClose={() => setAdding(false)} />
      <ChangePassword member={pwFor} onClose={() => setPwFor(null)} />
    </div>
  )
}

function AddCollaborator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [commission, setCommission] = useState(40)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const userOk = USERNAME_RULE.test(username) && !username.includes('..')
  const ready = name.trim().length >= 2 && isValidPhone(phone) && userOk && password.length >= 6

  async function save() {
    setSaving(true)
    setError('')
    try {
      const r = await createCollaboratorFn({ name: name.trim(), phone, username, password, commissionPercent: commission })
      setDone(`${name.trim()} cadastrado! Ele entra em barbearia-prime.pages.dev/login com o usuário "${r.data.username}" e a senha que você criou.`)
      setName('')
      setPhone('')
      setUsername('')
      setPassword('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setDone('')
        onClose()
      }}
      title="Novo colaborador"
    >
      {done ? (
        <div className="space-y-3 text-center">
          <p className="text-3xl">💈</p>
          <p className="text-sm text-neutral-300">{done}</p>
          <Button onClick={() => setDone('')}>Cadastrar outro</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Input
            label="Nome"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!username || username === suggestUsername(name)) setUsername(suggestUsername(e.target.value))
            }}
          />
          <PhoneInput label="WhatsApp" value={phone} onChange={setPhone} />
          <Input
            label="Usuário para entrar"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
            hint={userOk || !username ? 'Ex.: joao.silva — ele entra com isto e a senha.' : 'Use letras, números, ponto ou _ (3 a 30).'}
          />
          <PasswordInput label="Senha inicial" value={password} onChange={(e) => setPassword(e.target.value)} hint="Mínimo de 6 caracteres. Passe para ele." />
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            Comissão
            <input
              type="number"
              min={0}
              max={100}
              value={commission}
              onChange={(e) => setCommission(Number(e.target.value))}
              className="w-20 rounded-md border border-ink-border bg-ink-soft px-2 py-1 text-right text-neutral-100"
            />
            % sobre o que ele produzir
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button className="w-full" disabled={!ready} loading={saving} onClick={save}>
            Cadastrar colaborador
          </Button>
        </div>
      )}
    </Modal>
  )
}

function ChangePassword({ member, onClose }: { member: UserProfile | null; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!member) return
    setSaving(true)
    try {
      await setCollaboratorPasswordFn({ id: member.uid, password })
      alert('Senha trocada. Passe a nova senha para ele.')
      setPassword('')
      onClose()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal open={!!member} onClose={onClose} title={`Nova senha — ${member?.name ?? ''}`}>
      <div className="space-y-3">
        <PasswordInput label="Nova senha" value={password} onChange={(e) => setPassword(e.target.value)} hint="Mínimo de 6 caracteres." />
        <Button className="w-full" disabled={password.length < 6} loading={saving} onClick={save}>
          Salvar senha
        </Button>
      </div>
    </Modal>
  )
}
