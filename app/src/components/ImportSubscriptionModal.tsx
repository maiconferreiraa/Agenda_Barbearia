import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input, Select } from './ui/Field'
import { PhoneInput } from './ui/PhoneInput'
import { BirthdayInput } from './ui/BirthdayInput'
import { usePlans } from '../hooks/usePlans'
import { usePaymentSettings } from '../hooks/usePaymentSettings'
import { formatCurrency } from '../lib/format'
import { isValidPhone } from '../lib/phone'
import { importSubscriptionFn } from '../lib/paymentsApi'
import { CARD_RECURRING_ENABLED } from '../lib/features'

/** Dias de atraso até o plano vencer (mesmo valor do servidor, worker/src/scheduled.ts). */
const GRACE_DAYS = 10
/** Dias antes do vencimento em que o link é enviado (worker/src/scheduled.ts). */
const INVOICE_LEAD_DAYS = 5

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseDay(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const br = (d: Date) => d.toLocaleDateString('pt-BR')

const choice = (on: boolean) =>
  `rounded-lg border p-3 text-left transition-colors ${on ? 'border-gold bg-gold/10' : 'border-ink-border bg-ink-card hover:border-gold-dark'}`

/** Assinaturas → "Importar do sistema antigo": um assinante por vez, já com a régua de cobrança ligada. */
export function ImportSubscriptionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: plans } = usePlans({ onlyActive: true })
  const { settings: pay } = usePaymentSettings()
  const [whatsOn, setWhatsOn] = useState<boolean | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [planId, setPlanId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [paid, setPaid] = useState<boolean | 'card' | null>(null)
  const [usage, setUsage] = useState<Record<string, number>>({})
  const [welcome, setWelcome] = useState(true)
  const [birthday, setBirthday] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'private', 'whatsapp'),
        (s) => setWhatsOn(s.data()?.status === 'connected'),
        () => setWhatsOn(null),
      ),
    [],
  )

  function reset() {
    setName('')
    setPhone('')
    setDueDate('')
    setPaid(null)
    setUsage({})
    setWelcome(true)
    setBirthday('')
    setError('')
    setDone('')
  }
  useEffect(() => {
    if (open) reset()
  }, [open])

  const plan = plans.find((p) => p.id === planId)
  useEffect(() => setUsage({}), [planId])

  const due = dueDate ? parseDay(dueDate) : null
  const today = parseDay(todayStr())
  const daysLate = due ? Math.round((today.getTime() - due.getTime()) / 86400000) : 0

  const problem = useMemo(() => {
    if (name.trim().length < 2) return 'Digite o nome do cliente.'
    if (!isValidPhone(phone)) return 'Confira o telefone (só números, ex.: 31995012927).'
    if (!plan) return 'Escolha o plano.'
    if (paid === null) return 'Diga se a mensalidade atual já foi paga.'
    if (!due) return paid ? 'Informe o próximo vencimento.' : 'Informe o vencimento da mensalidade em aberto.'
    if (paid && due < today) return 'Se já pagou, o vencimento é o PRÓXIMO (data de hoje em diante).'
    if (!paid && !pay.infinitePayHandle) return 'Conecte a InfinitePay em Configurações pra gerar o link de pagamento.'
    return ''
  }, [name, phone, plan, paid, due, today, pay.infinitePayHandle])

  // O que vai acontecer, em português, antes de salvar.
  const preview = (() => {
    if (problem || !due || !plan) return null
    if (paid === 'card')
      return `Já entra ativo (não precisa confirmar). Nada de link: a InfinitePay segue cobrando o cartão. Em ${br(due)} o sistema renova o plano e os créditos sozinho. Se o app da InfinitePay mostrar cobrança recusada, toque em "Cartão recusado" em Assinaturas.`
    if (paid) {
      const send = new Date(due)
      send.setDate(send.getDate() - INVOICE_LEAD_DAYS)
      return send <= today
        ? `O link da próxima mensalidade (${br(due)}) já sai hoje, pois faltam ${INVOICE_LEAD_DAYS} dias ou menos.`
        : `O link da próxima mensalidade sai por volta de ${br(send)} (vence ${br(due)}).`
    }
    if (daysLate >= GRACE_DAYS)
      return `⚠️ Venceu há ${daysLate} dias: o plano vai ser marcado como VENCIDO na hora (passou de ${GRACE_DAYS} dias). O link de pagamento vai junto pra reativar.`
    if (daysLate > 0)
      return `O link sai agora e, como já venceu há ${daysLate} dia(s), o aviso 🚨 de atraso também. O plano vence se não pagar em ${GRACE_DAYS - daysLate} dia(s).`
    return `O link de pagamento de ${formatCurrency(plan.price)} sai agora, com vencimento em ${br(due)}.`
  })()

  async function save() {
    if (problem || !plan || paid === null) return
    setSaving(true)
    setError('')
    try {
      const r = await importSubscriptionFn({ name: name.trim(), phone, planId: plan.id, dueDate, paid, usage, welcome, birthday: birthday || null })
      setDone(
        `${name.trim()} importado no plano ${plan.name}.` +
          (r.data.reusedClient ? ' (Já tinha cadastro com esse telefone — usei o mesmo.)' : '') +
          (welcome ? (r.data.welcomeQueued ? ' A mensagem de boas-vindas está na fila do WhatsApp.' : '') : ''),
      )
    } catch (err) {
      setError((err as Error).message || 'Não foi possível importar.')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <Modal open={open} onClose={onClose} title="Cliente importado">
        <div className="space-y-4 text-center">
          <p className="text-3xl">✅</p>
          <p className="text-sm text-neutral-300">{done}</p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={reset}>
              Importar outro
            </Button>
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Importar do sistema antigo">
      <div className="space-y-4">
        {whatsOn === false && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            O WhatsApp da barbearia está desconectado. Pode importar: as mensagens ficam na fila e saem quando
            conectar (Configurações → WhatsApp da barbearia).
          </p>
        )}

        <Input label="Nome do cliente" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
        <PhoneInput label="WhatsApp do cliente" value={phone} onChange={setPhone} />
        <BirthdayInput value={birthday} onChange={setBirthday} />

        <Select label="Plano" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">Escolha…</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatCurrency(p.price)}/mês
            </option>
          ))}
        </Select>

        {plan && plan.includedServices.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-400">Quanto ele já usou neste mês</p>
            {plan.includedServices.map((i) => (
              <div key={i.serviceId} className="flex items-center justify-between gap-3 rounded-lg border border-ink-border px-3 py-2">
                <span className="text-sm text-neutral-200">{i.serviceName}</span>
                <span className="flex items-center gap-2 text-xs text-neutral-500">
                  <select
                    className="rounded-md border border-ink-border bg-ink-soft px-2 py-1 text-sm text-neutral-100"
                    value={usage[i.serviceId] ?? 0}
                    onChange={(e) => setUsage((u) => ({ ...u, [i.serviceId]: Number(e.target.value) }))}
                  >
                    {Array.from({ length: i.quantity + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  de {i.quantity} usados
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-400">A mensalidade deste mês</p>
          <div className={`grid grid-cols-2 gap-2 ${CARD_RECURRING_ENABLED ? 'sm:grid-cols-3' : ''}`}>
            {CARD_RECURRING_ENABLED && (
              <button type="button" className={choice(paid === 'card')} onClick={() => setPaid('card')}>
                <p className="text-sm font-medium text-neutral-100">💳 Cartão recorrente</p>
                <p className="text-xs text-neutral-500">Já desconta sozinho na InfinitePay</p>
              </button>
            )}
            <button type="button" className={choice(paid === true)} onClick={() => setPaid(true)}>
              <p className="text-sm font-medium text-neutral-100">✅ Já pagou</p>
              <p className="text-xs text-neutral-500">Está em dia</p>
            </button>
            <button type="button" className={choice(paid === false)} onClick={() => setPaid(false)}>
              <p className="text-sm font-medium text-neutral-100">⏳ Não pagou</p>
              <p className="text-xs text-neutral-500">Em aberto ou atrasada</p>
            </button>
          </div>
        </div>

        {paid !== null && (
          <Input
            label={paid === 'card' ? 'Próxima cobrança no cartão' : paid ? 'Próximo vencimento' : 'Vencimento da mensalidade em aberto'}
            type="date"
            value={dueDate}
            min={paid ? todayStr() : undefined}
            onChange={(e) => setDueDate(e.target.value)}
          />
        )}

        <label className="flex items-start gap-2 text-sm text-neutral-300">
          <input type="checkbox" className="mt-1" checked={welcome} onChange={(e) => setWelcome(e.target.checked)} />
          <span>
            Mandar mensagem no WhatsApp avisando do sistema novo
            {paid === false ? ' (já com o link de pagamento)' : ''}
          </span>
        </label>

        {preview && <p className="rounded-md border border-ink-border bg-ink-card px-3 py-2 text-xs text-neutral-300">{preview}</p>}
        {(error || (problem && name)) && <p className="text-sm text-red-400">{error || problem}</p>}

        <Button className="w-full" disabled={!!problem} loading={saving} onClick={save}>
          Importar cliente
        </Button>
      </div>
    </Modal>
  )
}
