import { useEffect, useState, type FormEvent } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { WEEKDAY_LABELS } from '../../lib/schedule'
import type { BusinessSettings, DayHours } from '../../types'

export function Settings() {
  const { settings, loading } = useBusinessSettings()
  const [form, setForm] = useState<BusinessSettings>(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!loading) setForm(settings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  function updateDay(key: keyof BusinessSettings['hours'], patch: Partial<DayHours>) {
    setForm((f) => ({ ...f, hours: { ...f.hours, [key]: { ...f.hours[key], ...patch } } }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await setDoc(doc(db, 'businessSettings', 'main'), form, { merge: true })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Configurações</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card className="space-y-3">
          <h2 className="font-display text-base text-gold-light">Dados da barbearia</h2>
          <Input
            label="Nome"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Telefone / WhatsApp"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <Input
              label="Duração do horário (min)"
              type="number"
              min={5}
              step={5}
              value={form.slotDurationMinutes}
              onChange={(e) =>
                setForm((f) => ({ ...f, slotDurationMinutes: Number(e.target.value) }))
              }
            />
          </div>
          <Input
            label="Endereço"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </Card>

        <Card className="space-y-3">
          <h2 className="font-display text-base text-gold-light">Horário de funcionamento</h2>
          {(Object.keys(form.hours) as (keyof BusinessSettings['hours'])[]).map((key) => {
            const day = form.hours[key]
            return (
              <div key={key} className="flex items-center gap-3">
                <label className="flex w-28 items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    onChange={(e) => updateDay(key, { enabled: e.target.checked })}
                  />
                  {WEEKDAY_LABELS[key]}
                </label>
                <input
                  type="time"
                  value={day.open}
                  disabled={!day.enabled}
                  onChange={(e) => updateDay(key, { open: e.target.value })}
                  className="rounded-md border border-ink-border bg-ink-soft px-2 py-1.5 text-sm text-neutral-100 disabled:opacity-40"
                />
                <span className="text-neutral-500">até</span>
                <input
                  type="time"
                  value={day.close}
                  disabled={!day.enabled}
                  onChange={(e) => updateDay(key, { close: e.target.value })}
                  className="rounded-md border border-ink-border bg-ink-soft px-2 py-1.5 text-sm text-neutral-100 disabled:opacity-40"
                />
              </div>
            )
          })}
        </Card>

        <Card>
          <h2 className="font-display text-base text-gold-light">Mercado Pago</h2>
          <p className="mt-1 text-sm text-neutral-400">
            A cobrança recorrente dos planos é feita via Mercado Pago. Configure o{' '}
            <code className="rounded bg-ink-soft px-1 py-0.5 text-xs">MP_ACCESS_TOKEN</code> nas
            variáveis de ambiente das Cloud Functions (veja o README do projeto). Esta tela não
            armazena credenciais sensíveis.
          </p>
        </Card>

        <Button type="submit" loading={saving} className="w-full">
          {saved ? 'Salvo ✓' : 'Salvar configurações'}
        </Button>
      </form>
    </div>
  )
}
