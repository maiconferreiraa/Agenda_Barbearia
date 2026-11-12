import { useEffect, useState, type FormEvent, Fragment } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { InfinitePayCard } from '../../components/InfinitePayCard'
import { WhatsAppCard } from '../../components/WhatsAppCard'
import { WEEKDAY_LABELS } from '../../lib/schedule'
import type { BusinessSettings, DayHours } from '../../types'

/** Horários em 24 h de 30 em 30 min (mantém um valor salvo fora dessa grade). */
function timeOptions(current: string) {
  const list: string[] = []
  for (let m = 5 * 60; m <= 23 * 60 + 30; m += 30) {
    list.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  if (current && !list.includes(current)) list.push(current)
  return list.sort()
}

import { PhoneInput } from '../../components/ui/PhoneInput'
import { cleanPhone } from '../../lib/phone'

import { saveFeeSettings, useFeeSettings } from '../../hooks/useFeeSettings'
import type { FeeSettings } from '../../types'

export function Settings() {
  const { settings, loading } = useBusinessSettings()
  const [form, setForm] = useState<BusinessSettings>(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { fees: savedFees, loading: loadingFees } = useFeeSettings()
  const [fees, setFees] = useState<FeeSettings>({})
  useEffect(() => {
    if (!loadingFees) setFees(savedFees)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingFees])

  useEffect(() => {
    if (!loading) setForm({ ...settings, phone: cleanPhone(settings.phone) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  function updateDay(key: keyof BusinessSettings['hours'], patch: Partial<DayHours>) {
    setForm((f) => ({ ...f, hours: { ...f.hours, [key]: { ...f.hours[key], ...patch } } }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await Promise.all([
        setDoc(doc(db, 'businessSettings', 'main'), form, { merge: true }),
        saveFeeSettings(fees),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Configurações</h1>

      <InfinitePayCard />

      <WhatsAppCard />

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card className="space-y-3">
          <h2 className="font-display text-base text-gold-light">Dados da barbearia</h2>
          <Input
            label="Nome"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <PhoneInput value={form.phone ?? ''} onChange={(phone) => setForm((f) => ({ ...f, phone }))} />
            <Input
              label="Grade da agenda (min)"
              hint="Só a divisão da agenda. Os horários livres seguem o tempo de cada serviço."
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
          <h2 className="font-display text-base text-gold-light">Quando um cliente cancela o plano</h2>
          <p className="text-sm text-neutral-400">
            O cliente recebe no WhatsApp uma mensagem perguntando o motivo e com esta oferta para continuar. As
            respostas chegam no WhatsApp da barbearia.
          </p>
          <Input
            label="Oferta para quem cancela"
            placeholder="Ex.: 10% de desconto na próxima mensalidade"
            value={form.retentionOffer ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, retentionOffer: e.target.value }))}
            hint="Deixe vazio para oferecer só 'uma condição especial', sem dizer qual."
          />
        </Card>

        <Card className="space-y-4">
          <h2 className="font-display text-base text-gold-light">Mensagens automáticas (trazer cliente de volta)</h2>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={form.winback?.enabled !== false}
                onChange={(e) => setForm((f) => ({ ...f, winback: { days: 30, ...f.winback, enabled: e.target.checked } }))}
              />
              💈 <b>Cliente sumido</b>: chamar quem não vem há
              <select
                value={form.winback?.days ?? 30}
                disabled={form.winback?.enabled === false}
                onChange={(e) => setForm((f) => ({ ...f, winback: { enabled: true, ...f.winback, days: Number(e.target.value) } }))}
                className="rounded-md border border-ink-border bg-ink-soft px-1.5 py-1 text-sm text-neutral-100 disabled:opacity-40"
              >
                {[20, 30, 45, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Oferta para quem sumiu (opcional)"
              placeholder="Ex.: Barba grátis no próximo corte"
              value={form.winback?.offer ?? ''}
              disabled={form.winback?.enabled === false}
              onChange={(e) => setForm((f) => ({ ...f, winback: { enabled: true, days: 30, ...f.winback, offer: e.target.value } }))}
            />
            <p className="text-xs text-neutral-500">
              Uma mensagem por ausência ("Sentimos sua falta… marque seu horário"). Quem já tem horário marcado não recebe.
            </p>
          </div>
          <div className="space-y-2 border-t border-ink-border pt-3">
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={form.birthday?.enabled !== false}
                onChange={(e) => setForm((f) => ({ ...f, birthday: { ...f.birthday, enabled: e.target.checked } }))}
              />
              🎉 <b>Aniversário</b>: mensagem no dia
            </label>
            <Input
              label="Presente de aniversário (opcional)"
              placeholder="Ex.: 20% de desconto no corte esta semana"
              value={form.birthday?.gift ?? ''}
              disabled={form.birthday?.enabled === false}
              onChange={(e) => setForm((f) => ({ ...f, birthday: { enabled: true, ...f.birthday, gift: e.target.value } }))}
            />
            <p className="text-xs text-neutral-500">
              Vale para quem informou o aniversário no cadastro (ou você preencheu em Clientes). As mensagens saem às 10h.
            </p>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-display text-base text-gold-light">Taxas da InfinitePay</h2>
          <p className="text-sm text-neutral-400">
            🔒 Só você vê. A InfinitePay desconta a taxa antes de depositar, mas não informa ao sistema quanto foi.
            Copie as suas taxas do app da InfinitePay para o relatório mostrar o valor líquido (o que cai na conta).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Taxa no Pix (%)"
              type="number"
              inputMode="decimal"
              min={0}
              max={20}
              step={0.01}
              placeholder="0"
              value={fees.feePixPercent ?? ''}
              onChange={(e) =>
                setFees((f) => ({ ...f, feePixPercent: e.target.value === '' ? undefined : Number(e.target.value) }))
              }
            />
            <Input
              label="Taxa no cartão à vista (%)"
              type="number"
              inputMode="decimal"
              min={0}
              max={20}
              step={0.01}
              placeholder="Ex.: 3,15"
              value={fees.feeCardPercent ?? ''}
              onChange={(e) =>
                setFees((f) => ({ ...f, feeCardPercent: e.target.value === '' ? undefined : Number(e.target.value) }))
              }
            />
          </div>
          <p className="text-xs text-neutral-500">
            Vale para as mensalidades pagas pelo sistema (link mensal e cartão recorrente). É uma estimativa: o valor
            exato de cada pagamento fica no app da InfinitePay.
          </p>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-display text-base text-gold-light">Almoço (pausa de todo dia)</h2>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={!!form.lunch?.enabled}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    lunch: { start: '12:00', end: '13:00', ...f.lunch, enabled: e.target.checked },
                  }))
                }
              />
              Almoço
            </label>
            {(['start', 'end'] as const).map((k, i) => (
              <Fragment key={k}>
                {i === 1 && <span className="text-neutral-500">até</span>}
                <select
                  value={form.lunch?.[k] ?? (k === 'start' ? '12:00' : '13:00')}
                  disabled={!form.lunch?.enabled}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      lunch: { enabled: true, start: '12:00', end: '13:00', ...f.lunch, [k]: e.target.value },
                    }))
                  }
                  className="w-full min-w-0 rounded-md border border-ink-border bg-ink-soft px-1.5 py-1.5 text-sm text-neutral-100 disabled:opacity-40"
                >
                  {timeOptions(form.lunch?.[k] ?? '').map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Fragment>
            ))}
          </div>
          <p className="text-xs text-neutral-500">
            Nesse intervalo não aparece horário para os clientes, em todos os dias. Para bloquear um horário só de um
            dia, use a Agenda.
          </p>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-display text-base text-gold-light">Horário de funcionamento</h2>
          {(Object.keys(WEEKDAY_LABELS) as (keyof BusinessSettings['hours'])[]).map((key) => {
            const day = form.hours[key]
            if (!day) return null
            return (
              <div key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    onChange={(e) => updateDay(key, { enabled: e.target.checked })}
                  />
                  {WEEKDAY_LABELS[key]}
                </label>
                <select
                  value={day.open}
                  disabled={!day.enabled}
                  onChange={(e) => updateDay(key, { open: e.target.value })}
                  className="w-full min-w-0 rounded-md border border-ink-border bg-ink-soft px-1.5 py-1.5 text-sm text-neutral-100 disabled:opacity-40"
                >
                  {timeOptions(day.open).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <span className="text-neutral-500">até</span>
                <select
                  value={day.close}
                  disabled={!day.enabled}
                  onChange={(e) => updateDay(key, { close: e.target.value })}
                  className="w-full min-w-0 rounded-md border border-ink-border bg-ink-soft px-1.5 py-1.5 text-sm text-neutral-100 disabled:opacity-40"
                >
                  {timeOptions(day.close).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </Card>


        <Button type="submit" loading={saving} className="w-full">
          {saved ? 'Salvo ✓' : 'Salvar configurações'}
        </Button>
      </form>
    </div>
  )
}
