import { useState, type FormEvent } from 'react'
import { Timestamp, addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { Input, Select } from './ui/Field'
import { Modal } from './ui/Modal'
import { formatCurrency } from '../lib/format'
import type { FinanceReport, Period } from '../lib/finance'
import { EXPENSE_CATEGORIES, type Expense } from '../types'

function todayInput() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Saídas do período + botão para o dono cadastrar (fixas repetem todo mês sozinhas). */
export function ExpensesCard({
  report,
  period,
  expenses,
}: {
  report: FinanceReport
  period: Period
  expenses: Expense[]
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    description: '',
    category: 'Aluguel',
    amount: '',
    date: todayInput(),
    recurring: true,
  })

  function openNew() {
    setForm({ description: '', category: 'Aluguel', amount: '', date: todayInput(), recurring: true })
    setError('')
    setOpen(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    const amount = Number(form.amount.replace(/\./g, '').replace(',', '.'))
    if (!form.description.trim()) return setError('Descreva a saída (ex.: Aluguel do salão).')
    if (!amount || amount <= 0) return setError('Informe um valor maior que zero.')
    const [y, m, d] = form.date.split('-').map(Number)
    setSaving(true)
    try {
      await addDoc(collection(db, 'expenses'), {
        description: form.description.trim(),
        category: form.category,
        amount: Math.round(amount * 100) / 100,
        date: Timestamp.fromDate(new Date(y, m - 1, d, 12)),
        recurring: form.recurring,
        endedAt: null,
        createdAt: serverTimestamp(),
      })
      setOpen(false)
    } catch (err) {
      setError('Não foi possível salvar. ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, recurring: boolean) {
    const msg = recurring
      ? 'Apagar esta saída fixa? Ela some de TODOS os meses. (Para só parar daqui pra frente, use "Parar de repetir".)'
      : 'Apagar esta saída?'
    if (!confirm(msg)) return
    await deleteDoc(doc(db, 'expenses', id))
  }

  async function handleStop(id: string) {
    if (!confirm('Parar de repetir esta saída a partir de hoje? Os meses anteriores continuam no relatório.')) return
    await updateDoc(doc(db, 'expenses', id), { endedAt: Timestamp.now() })
  }

  const byId = new Map(expenses.map((e) => [e.id, e]))

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base text-neutral-100">Saídas do período</h2>
        <Button onClick={openNew} className="!px-3 !py-1.5 text-xs">
          + Adicionar saída
        </Button>
      </div>

      {report.expenseDetails.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nenhuma saída em {period.label}. Cadastre aluguel, energia, água, itens do salão…
        </p>
      ) : (
        <ul className="divide-y divide-ink-border">
          {report.expenseDetails.map((x) => {
            const e = byId.get(x.expenseId)
            const stopped = !!e?.endedAt
            return (
              <li key={`${x.expenseId}-${x.date.getTime()}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-neutral-100">
                    {x.item}
                    {x.recurring && (
                      <span className="ml-2 rounded bg-neutral-700/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                        {stopped ? 'fixa (encerrada)' : 'fixa · todo mês'}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {x.method} · {x.date.toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-neutral-100">{formatCurrency(x.amount)}</span>
                  {x.recurring && !stopped && (
                    <button
                      type="button"
                      onClick={() => handleStop(x.expenseId)}
                      className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-200"
                    >
                      Parar de repetir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(x.expenseId, x.recurring)}
                    className="text-xs text-neutral-500 underline underline-offset-2 hover:text-red-300"
                  >
                    Apagar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {report.byCategory.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {report.byCategory.map((c) => (
            <span key={c.name} className="rounded-md border border-ink-border px-2 py-1 text-xs text-neutral-300">
              {c.name}: <span className="tabular-nums text-neutral-100">{formatCurrency(c.total)}</span>
            </span>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Adicionar saída">
        <form onSubmit={handleSave} className="space-y-3">
          <Select
            label="Tipo"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            label="Descrição"
            placeholder="Ex.: Aluguel do salão, conta de luz, lâminas…"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Valor (R$)"
              inputMode="decimal"
              placeholder="0,00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <Input
              label="Data"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-[var(--color-gold)]"
            />
            <span>
              <b>Repete todo mês</b> (aluguel, internet…). Cadastra uma vez e entra sozinha todo mês nesse dia.
              Desmarque para contas que mudam de valor, como energia e água.
            </span>
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" loading={saving} className="w-full">
            Salvar saída
          </Button>
        </form>
      </Modal>
    </Card>
  )
}
