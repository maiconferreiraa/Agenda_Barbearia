import { useState, type FormEvent } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input, Textarea } from '../../components/ui/Field'
import { Spinner } from '../../components/ui/Spinner'
import { useServices } from '../../hooks/useServices'
import { formatCurrency } from '../../lib/format'
import type { ServiceItem } from '../../types'

const DEFAULT_SERVICES = [
  { name: 'Corte', durationMinutes: 40, price: 45, category: 'Cabelo' },
  { name: 'Barba', durationMinutes: 25, price: 30, category: 'Barba' },
  { name: 'Sobrancelha', durationMinutes: 15, price: 15, category: 'Estética' },
  { name: 'Hidratação', durationMinutes: 30, price: 40, category: 'Tratamento' },
  { name: 'Pintura', durationMinutes: 60, price: 70, category: 'Coloração' },
  { name: 'Pezinho', durationMinutes: 15, price: 15, category: 'Cabelo' },
]

export function Services() {
  const { data: services, loading } = useServices()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceItem | null>(null)
  const [saving, setSaving] = useState(false)

  function openNew() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(s: ServiceItem) {
    setEditing(s)
    setModalOpen(true)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const payload = {
      name: String(form.get('name')),
      description: String(form.get('description') || ''),
      durationMinutes: Number(form.get('durationMinutes')),
      price: Number(form.get('price')),
      category: String(form.get('category') || 'Geral'),
      active: form.get('active') === 'on',
    }
    setSaving(true)
    try {
      if (editing) {
        await updateDoc(doc(db, 'services', editing.id), payload)
      } else {
        await addDoc(collection(db, 'services'), { ...payload, createdAt: serverTimestamp() })
      }
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este serviço?')) return
    await deleteDoc(doc(db, 'services', id))
  }

  async function seedDefaults() {
    const batch = writeBatch(db)
    DEFAULT_SERVICES.forEach((s) => {
      const ref = doc(collection(db, 'services'))
      batch.set(ref, { ...s, description: '', active: true, createdAt: serverTimestamp() })
    })
    await batch.commit()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-neutral-100">Serviços</h1>
        <Button onClick={openNew}>+ Novo serviço</Button>
      </div>

      {loading && <Spinner full />}

      {!loading && services.length === 0 && (
        <Card className="text-center">
          <p className="mb-3 text-sm text-neutral-400">
            Nenhum serviço cadastrado ainda. Comece com os serviços padrão de barbearia.
          </p>
          <Button variant="secondary" onClick={seedDefaults}>
            Adicionar serviços padrão (corte, barba, sobrancelha...)
          </Button>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <Card key={s.id} className={!s.active ? 'opacity-50' : ''}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-neutral-100">{s.name}</p>
                <p className="text-xs text-neutral-500">{s.category}</p>
              </div>
              <p className="font-display text-gold-light">{formatCurrency(s.price)}</p>
            </div>
            {s.description && <p className="mt-2 text-xs text-neutral-400">{s.description}</p>}
            <p className="mt-2 text-xs text-neutral-500">{s.durationMinutes} min</p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => openEdit(s)} className="!px-3 !py-1.5 text-xs">
                Editar
              </Button>
              <Button variant="danger" onClick={() => handleDelete(s.id)} className="!px-3 !py-1.5 text-xs">
                Remover
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar serviço' : 'Novo serviço'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input name="name" label="Nome" required defaultValue={editing?.name} placeholder="Ex: Corte degradê" />
          <Input name="category" label="Categoria" defaultValue={editing?.category} placeholder="Ex: Cabelo" />
          <Textarea name="description" label="Descrição (opcional)" defaultValue={editing?.description} />
          <div className="grid grid-cols-2 gap-3">
            <Input
              name="durationMinutes"
              type="number"
              min={5}
              step={5}
              label="Duração (min)"
              required
              defaultValue={editing?.durationMinutes ?? 30}
            />
            <Input
              name="price"
              type="number"
              min={0}
              step={0.01}
              label="Valor (R$)"
              required
              defaultValue={editing?.price ?? 0}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
            Ativo (disponível para agendamento)
          </label>
          <Button type="submit" loading={saving} className="w-full">
            Salvar
          </Button>
        </form>
      </Modal>
    </div>
  )
}
