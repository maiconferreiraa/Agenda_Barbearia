import { useState, type FormEvent } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { Card } from '../../components/ui/Card'
import { PlanBanner } from '../../components/PlanBanner'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input, Textarea } from '../../components/ui/Field'
import { CARD_RECURRING_ENABLED } from '../../lib/features'
import { Spinner } from '../../components/ui/Spinner'
import { useServices } from '../../hooks/useServices'
import { usePlans } from '../../hooks/usePlans'
import { formatCurrency } from '../../lib/format'
import type { Plan, PlanIncludedService } from '../../types'

export function Plans() {
  const { data: plans, loading } = usePlans()
  const { data: services } = useServices({ onlyActive: true })
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [saving, setSaving] = useState(false)
  /** Como o plano cobra: link novo todo mês (automático) ou cartão recorrente da maquininha. */
  const [billing, setBilling] = useState<'link' | 'card'>('link')

  function openNew() {
    setEditing(null)
    setBilling('link')
    setModalOpen(true)
  }
  function openEdit(p: Plan) {
    setEditing(p)
    setBilling(p.recurringLink ? 'card' : 'link')
    setModalOpen(true)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const includedServices: PlanIncludedService[] = services
      .map((s) => {
        const qty = Number(form.get(`qty_${s.id}`) || 0)
        return qty > 0 ? { serviceId: s.id, serviceName: s.name, quantity: qty } : null
      })
      .filter((v): v is PlanIncludedService => v !== null)

    const payload = {
      name: String(form.get('name')).trim(),
      description: String(form.get('description') || ''),
      price: Number(form.get('price')),
      active: form.get('active') === 'on',
      includedServices,
      // em espera: sem o campo na tela, mantém o que já estiver salvo
      recurringLink: !CARD_RECURRING_ENABLED
        ? (editing?.recurringLink ?? null)
        : billing === 'card'
          ? String(form.get('recurringLink') || '').trim() || null
          : null,
    }
    if (billing === 'card' && CARD_RECURRING_ENABLED && !payload.recurringLink) {
      alert('Cole o link do plano recorrente da InfinitePay, ou escolha "Link todo mês".')
      return
    }
    if (payload.recurringLink && !/^https:\/\/([a-z0-9-]+\.)*infinitepay\.io\//i.test(payload.recurringLink)) {
      alert('O link de cobrança recorrente precisa ser um link da InfinitePay (começa com https:// e tem infinitepay.io).')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        await updateDoc(doc(db, 'plans', editing.id), payload)
      } else {
        await addDoc(collection(db, 'plans'), { ...payload, createdAt: serverTimestamp() })
      }
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este plano? Assinaturas já ativas não serão afetadas.')) return
    await deleteDoc(doc(db, 'plans', id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-neutral-100">Planos mensais</h1>
        <Button onClick={openNew}>+ Novo plano</Button>
      </div>

      {loading && <Spinner full />}

      {!loading && plans.length === 0 && (
        <Card className="text-center text-sm text-neutral-400">
          Nenhum plano cadastrado ainda. Crie um plano, por exemplo "4 cortes por mês".
        </Card>
      )}

      {!loading && services.length === 0 && (
        <Card className="text-sm text-amber-400">
          Cadastre serviços primeiro em <b>Serviços</b> para poder incluí-los em um plano.
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id} className={`overflow-hidden ${!p.active ? 'opacity-50' : ''}`}>
            <PlanBanner />
            <div className="flex items-start justify-between">
              <p className="font-medium text-neutral-100">{p.name}</p>
              <p className="font-display text-gold-light">{formatCurrency(p.price)}/mês</p>
            </div>
            {p.description && <p className="mt-1 text-xs text-neutral-400">{p.description}</p>}
            {CARD_RECURRING_ENABLED && (
              <p className="mt-1 text-xs text-neutral-500">
                {p.recurringLink ? '💳 Cartão recorrente (InfinitePay)' : '🔗 Link mensal (Pix ou cartão)'}
              </p>
            )}
            <ul className="mt-2 space-y-0.5 text-xs text-neutral-400">
              {p.includedServices.map((i) => (
                <li key={i.serviceId}>
                  • {i.quantity}x {i.serviceName} / mês
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => openEdit(p)} className="!px-3 !py-1.5 text-xs">
                Editar
              </Button>
              <Button variant="danger" onClick={() => handleDelete(p.id)} className="!px-3 !py-1.5 text-xs">
                Remover
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar plano' : 'Novo plano'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input name="name" label="Nome do plano" required defaultValue={editing?.name} placeholder="Ex: Plano Mensal 4 cortes" />
          <Textarea name="description" label="Descrição (opcional)" defaultValue={editing?.description} />
          <Input
            name="price"
            type="number"
            min={0}
            step={0.01}
            label="Valor mensal (R$)"
            required
            defaultValue={editing?.price ?? 0}
          />

          <div>
            <p className="mb-1.5 text-xs font-medium text-neutral-400">Serviços incluídos por mês</p>
            <div className="space-y-2 rounded-lg border border-ink-border p-2.5">
              {services.map((s) => {
                const existing = editing?.includedServices.find((i) => i.serviceId === s.id)
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-neutral-300">{s.name}</span>
                    <input
                      type="number"
                      name={`qty_${s.id}`}
                      min={0}
                      defaultValue={existing?.quantity ?? 0}
                      className="w-16 rounded-md border border-ink-border bg-ink-soft px-2 py-1 text-sm text-neutral-100"
                    />
                  </div>
                )
              })}
              {services.length === 0 && (
                <p className="text-xs text-neutral-500">Nenhum serviço ativo cadastrado.</p>
              )}
            </div>
          </div>

          {CARD_RECURRING_ENABLED && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-400">Como cobrar este plano</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['link', '🔗 Link todo mês', 'O sistema manda o link (Pix ou cartão) e sabe sozinho quem pagou.'],
                ['card', '💳 Cartão recorrente', 'Igual à maquininha: desconta sozinho no cartão todo mês.'],
              ] as const).map(([value, title, desc]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBilling(value)}
                  className={`rounded-lg border p-3 text-left transition-colors ${billing === value ? 'border-gold bg-gold/10' : 'border-ink-border bg-ink-card hover:border-gold-dark'}`}
                >
                  <p className="text-sm font-medium text-neutral-100">{title}</p>
                  <p className="text-xs text-neutral-500">{desc}</p>
                </button>
              ))}
            </div>
          </div>
          )}

          {CARD_RECURRING_ENABLED && billing === 'card' && (
          <div className="space-y-1.5 rounded-lg border border-ink-border p-3">
            <Input
              name="recurringLink"
              type="url"
              label="💳 Link do plano recorrente da InfinitePay"
              defaultValue={editing?.recurringLink ?? ''}
              placeholder="https://…infinitepay.io/…"
            />
            <p className="text-xs text-neutral-500">
              No app da InfinitePay: <b>Vendas → Planos e Recorrência → Planos e cobranças</b> → toque no plano com o
              mesmo valor → <b>copiar link</b>, e cole aqui. O cliente se cadastra lá, paga o 1º mês na hora e a
              InfinitePay desconta sozinha todo mês.
            </p>
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-xs text-amber-300">
              ⚠️ <b>Importante:</b> a InfinitePay não avisa o sistema dos pagamentos no cartão. Para o sistema ficar
              igual à sua maquininha: quando um cliente novo assinar, confira no app da InfinitePay e toque em{' '}
              <b>Confirmar pagamento</b> em Assinaturas (só no 1º mês). Se o app mostrar uma cobrança{' '}
              <b>recusada</b>, toque em <b>Cartão recusado</b>. O resto (renovação, créditos e lembretes) é automático.
            </p>
          </div>
          )}

          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
            Ativo (disponível no catálogo do cliente)
          </label>

          <Button type="submit" loading={saving} className="w-full">
            Salvar plano
          </Button>
        </form>
      </Modal>
    </div>
  )
}
