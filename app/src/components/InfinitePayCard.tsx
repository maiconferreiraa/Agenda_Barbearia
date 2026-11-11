import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Field'
import { usePaymentSettings } from '../hooks/usePaymentSettings'
import { connectInfinitePayFn } from '../lib/paymentsApi'

/** Página da InfinitePay onde o dono libera a cobrança por sistema (Checkout Integrado). */
const ENABLE_CHECKOUT_URL = 'https://app.infinitepay.io/external-checkout#configuracoes?enabled=true'

/** Configurações → Pagamentos: o dono cola a InfiniteTag e toca "Conectar". */
export function InfinitePayCard() {
  const { settings, loading } = usePaymentSettings()
  const [tag, setTag] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const connected = !!settings.infinitePayHandle
  /** Foi ativar na InfinitePay: ao voltar pro app, tenta conectar de novo sozinho. */
  const waitingActivation = useRef(false)

  async function connect(handle: string) {
    setBusy(true)
    setError('')
    try {
      await connectInfinitePayFn({ handle })
      setTag('')
      waitingActivation.current = false
    } catch (err) {
      setError((err as Error).message || 'Não foi possível conectar.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    function onBack() {
      if (document.visibilityState === 'visible' && waitingActivation.current && tag) connect(tag)
    }
    document.addEventListener('visibilitychange', onBack)
    window.addEventListener('focus', onBack)
    return () => {
      document.removeEventListener('visibilitychange', onBack)
      window.removeEventListener('focus', onBack)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag])

  async function handleConnect(e: FormEvent) {
    e.preventDefault()
    await connect(tag)
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
          <div className="rounded-md border border-ink-border bg-ink-soft px-3 py-2 text-xs text-neutral-400">
            <p className="mb-1 font-medium text-neutral-300">Antes, na sua conta InfinitePay:</p>
            <p>✓ Tenha uma <b>chave Pix cadastrada</b> (no app InfinitePay → Pix → Minhas chaves).</p>
            <p>✓ O <b>Checkout Integrado</b> ligado — se não estiver, o botão abaixo te leva lá.</p>
          </div>
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
          {error.includes('Ativar na InfinitePay') && (
            <a
              href={ENABLE_CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
              onClick={() => {
                waitingActivation.current = true
              }}
            >
              <Button type="button" variant="secondary" className="w-full">
                Ativar na InfinitePay ↗
              </Button>
              <p className="mt-1 text-center text-xs text-neutral-500">
                Ligue "Habilitar Checkout Integrado" e volte pra cá — a conexão é refeita sozinha.
              </p>
            </a>
          )}
          <Button type="submit" loading={busy} className="w-full">
            Conectar
          </Button>
        </form>
      )}
    </Card>
  )
}
