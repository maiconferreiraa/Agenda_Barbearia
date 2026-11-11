import { useState, type FormEvent } from 'react'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Field'
import { usePaymentSettings } from '../hooks/usePaymentSettings'
import { connectInfinitePayFn } from '../lib/paymentsApi'

/** Configurações → Pagamentos: o dono cola a InfiniteTag e toca "Conectar". */
export function InfinitePayCard() {
  const { settings, loading } = usePaymentSettings()
  const [tag, setTag] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const connected = !!settings.infinitePayHandle

  async function handleConnect(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await connectInfinitePayFn({ handle: tag })
      setTag('')
    } catch (err) {
      setError((err as Error).message || 'Não foi possível conectar.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar a InfinitePay? Novas mensalidades não serão geradas até conectar de novo.')) return
    setBusy(true)
    try {
      await connectInfinitePayFn({ disconnect: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-display text-base text-gold-light">Pagamentos (InfinitePay)</h2>

      {!loading && connected && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <p className="text-sm text-emerald-300">
            ✓ Conectado como <b>${settings.infinitePayHandle}</b>
          </p>
          <Button variant="danger" onClick={handleDisconnect} loading={busy} className="!px-3 !py-1.5 text-xs">
            Desconectar
          </Button>
        </div>
      )}

      {!loading && !connected && (
        <form onSubmit={handleConnect} className="space-y-3">
          <p className="text-sm text-neutral-400">
            Cole sua <b>InfiniteTag</b> para receber as mensalidades dos planos por Pix ou cartão.
            Ela aparece no app da InfinitePay e começa com <b>$</b> (ex.: $barbeariaprime).
          </p>
          <Input
            label="InfiniteTag"
            placeholder="$suabarbearia"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" loading={busy} className="w-full">
            Conectar
          </Button>
        </form>
      )}
    </Card>
  )
}
