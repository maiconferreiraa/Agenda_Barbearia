import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { StatusBadge } from '../../components/StatusBadge'
import { useClients } from '../../hooks/useClients'
import { useAllSubscriptions } from '../../hooks/useSubscriptions'
import { initials } from '../../lib/format'
import { cleanPhone, isValidPhone } from '../../lib/phone'
import { updateClientPhoneFn } from '../../lib/paymentsApi'
import type { UserProfile } from '../../types'

export function Clients() {
  const { data: clients, loading } = useClients()
  const { data: subscriptions } = useAllSubscriptions()
  const [editing, setEditing] = useState<UserProfile | null>(null)
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function openEdit(c: UserProfile) {
    setEditing(c)
    setPhone(cleanPhone(c.phone))
    setError('')
  }

  async function savePhone() {
    if (!editing) return
    setSaving(true)
    setError('')
    try {
      await updateClientPhoneFn({ clientId: editing.uid, phone })
      setEditing(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Clientes</h1>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Telefone de ${editing?.name ?? ''}`}>
        <div className="space-y-3">
          <PhoneInput label="WhatsApp" value={phone} onChange={setPhone} />
          <p className="text-xs text-neutral-500">Os avisos de mensalidade e de horário vão para este número.</p>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button className="w-full" disabled={!isValidPhone(phone)} loading={saving} onClick={savePhone}>
            Salvar telefone
          </Button>
        </div>
      </Modal>

      {loading && <Spinner full />}

      {!loading && clients.length === 0 && (
        <Card className="text-center text-sm text-neutral-400">Nenhum cliente cadastrado ainda.</Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((c) => {
          const activeSub = subscriptions.find(
            (s) => s.clientId === c.uid && (s.status === 'active' || s.status === 'past_due'),
          )
          const phoneOk = isValidPhone(c.phone ?? '')
          return (
            <Card key={c.uid} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-medium text-gold-light">
                {initials(c.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-100">
                  {c.name}
                  {c.imported && !c.hasAccount && (
                    <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-neutral-500">sem app</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  className={`truncate text-left text-xs underline-offset-2 hover:underline ${phoneOk ? 'text-neutral-500' : 'text-amber-400'}`}
                  title="Corrigir telefone"
                >
                  {c.phone ? (phoneOk ? c.phone : `${c.phone} · corrigir`) : 'sem telefone · adicionar'} ✎
                </button>
              </div>
              {activeSub ? (
                <StatusBadge status={activeSub.status} />
              ) : (
                <span className="text-xs text-neutral-600">sem plano</span>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
