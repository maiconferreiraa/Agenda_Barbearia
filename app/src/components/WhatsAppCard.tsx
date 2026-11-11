import { useEffect, useState } from 'react'
import { doc, onSnapshot, updateDoc, type Timestamp } from 'firebase/firestore'
import QRCode from 'qrcode'
import { db } from '../firebase'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Field'
import { useBusinessSettings } from '../hooks/useBusinessSettings'

interface WhatsAppState {
  status?: 'qr' | 'connected' | 'disconnected'
  qr?: string | null
  phone?: string | null
  /** Código de 8 letras para conectar sem QR (só pelo celular). */
  pairingCode?: string | null
  pairingError?: string | null
  updatedAt?: Timestamp
}

/** Considera a ponte fora do ar se não deu sinal há mais de 3 min esperando QR. */
const QR_STALE_MS = 3 * 60 * 1000

function formatPhone(digits: string) {
  let d = digits.replace(/^55/, '')
  // o WhatsApp às vezes devolve o celular sem o 9 (DDD + 8 dígitos começando com 6–9)
  if (d.length === 10 && /^[6-9]$/.test(d[2])) d = `${d.slice(0, 2)}9${d.slice(2)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return digits
}

/**
 * Configurações → WhatsApp da barbearia: o dono escaneia o QR com o celular
 * e os avisos (mensalidade, atraso, pagamento) passam a sair do número dele.
 */
export function WhatsAppCard() {
  const [state, setState] = useState<WhatsAppState | null>(null)
  const [qrImage, setQrImage] = useState('')
  const [busy, setBusy] = useState(false)
  // No celular não dá pra escanear a própria tela: começa pelo código.
  const [mode, setMode] = useState<'code' | 'qr'>(() => (window.innerWidth < 768 ? 'code' : 'qr'))
  const { settings } = useBusinessSettings()
  const [pairPhone, setPairPhone] = useState('')
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    if (!pairPhone && settings.phone) setPairPhone(settings.phone)
  }, [settings.phone, pairPhone])

  // Chegou o código (ou erro): para de esperar.
  useEffect(() => {
    if (state?.pairingCode || state?.pairingError) setRequesting(false)
  }, [state?.pairingCode, state?.pairingError])

  async function handleRequestCode() {
    setRequesting(true)
    try {
      await updateDoc(doc(db, 'private', 'whatsapp'), { command: 'pair', pairPhone })
    } catch {
      setRequesting(false)
    }
  }

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'private', 'whatsapp'),
        (snap) => setState((snap.data() as WhatsAppState) ?? {}),
        () => setState({}),
      ),
    [],
  )

  useEffect(() => {
    if (state?.status === 'qr' && state.qr) {
      QRCode.toDataURL(state.qr, { width: 260, margin: 1 }).then(setQrImage).catch(() => setQrImage(''))
    } else {
      setQrImage('')
    }
  }, [state?.status, state?.qr])

  async function handleDisconnect() {
    if (!confirm('Desconectar o WhatsApp da barbearia? Os avisos param até conectar de novo.')) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'private', 'whatsapp'), { command: 'logout' })
    } finally {
      setBusy(false)
    }
  }

  const updated = state?.updatedAt?.toDate?.()?.getTime() ?? 0
  const qrStale = state?.status === 'qr' && Date.now() - updated > QR_STALE_MS

  return (
    <Card className="space-y-3">
      <h2 className="font-display text-base text-gold-light">WhatsApp da barbearia</h2>
      <p className="text-sm text-neutral-400">
        Os avisos de mensalidade, atraso e pagamento saem do WhatsApp conectado aqui.
      </p>

      {state === null && <p className="text-sm text-neutral-500">Carregando…</p>}

      {state?.status === 'connected' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <p className="text-sm text-emerald-300">
            ✓ Conectado{state.phone ? <> — <b>{formatPhone(state.phone)}</b></> : null}
          </p>
          <Button variant="danger" onClick={handleDisconnect} loading={busy} className="!px-3 !py-1.5 text-xs">
            Desconectar
          </Button>
        </div>
      )}

      {state?.status === 'qr' && !qrStale && (
        <div className="space-y-3">
          <div className="flex rounded-md border border-ink-border p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setMode('code')}
              className={`flex-1 rounded px-2 py-1.5 ${mode === 'code' ? 'bg-gold text-ink' : 'text-neutral-400'}`}
            >
              Só pelo celular
            </button>
            <button
              type="button"
              onClick={() => setMode('qr')}
              className={`flex-1 rounded px-2 py-1.5 ${mode === 'qr' ? 'bg-gold text-ink' : 'text-neutral-400'}`}
            >
              Pelo computador (QR)
            </button>
          </div>

          {mode === 'code' && (
            <div className="space-y-3">
              {!state.pairingCode ? (
                <>
                  <Input
                    label="Número do WhatsApp da barbearia"
                    inputMode="tel"
                    placeholder="(31) 99999-9999"
                    value={pairPhone}
                    onChange={(e) => setPairPhone(e.target.value)}
                  />
                  {state.pairingError && <p className="text-sm text-red-400">{state.pairingError}</p>}
                  <Button className="w-full" loading={requesting} onClick={handleRequestCode}>
                    Gerar código
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-center text-xs text-neutral-400">Seu código:</p>
                  <p className="text-center font-mono text-3xl tracking-[0.2em] text-gold-light">{state.pairingCode}</p>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-300">
                    <li>Abra o <b>WhatsApp</b> desse número.</li>
                    <li>
                      Toque em <b>⋮ (ou Configurações) → Aparelhos conectados → Conectar um aparelho</b>.
                    </li>
                    <li>
                      Toque em <b>"Conectar com número de telefone"</b> e digite o código acima.
                    </li>
                  </ol>
                  <p className="text-xs text-neutral-500">
                    Quando o WhatsApp pedir, deixe esta tela aberta ou volte pra ela — aparece "✓ Conectado" sozinho.
                  </p>
                  <button
                    type="button"
                    onClick={handleRequestCode}
                    className="text-xs text-neutral-500 underline underline-offset-2"
                  >
                    Gerar outro código
                  </button>
                </>
              )}
            </div>
          )}

          {mode === 'qr' && qrImage && (
            <div className="space-y-3">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-300">
                <li>No celular da barbearia, abra o <b>WhatsApp</b>.</li>
                <li>
                  Toque em <b>⋮ (ou Configurações) → Aparelhos conectados → Conectar um aparelho</b>.
                </li>
                <li>Aponte a câmera para o código abaixo.</li>
              </ol>
              <div className="flex justify-center rounded-md bg-white p-3">
                <img src={qrImage} alt="QR Code para conectar o WhatsApp" className="h-56 w-56" />
              </div>
              <p className="text-center text-xs text-neutral-500">O código muda sozinho a cada poucos segundos.</p>
            </div>
          )}
        </div>
      )}

      {state && (!state.status || state.status === 'disconnected' || qrStale) && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">
          A conexão do WhatsApp está fora do ar no momento. Avise o suporte do sistema.
        </p>
      )}
    </Card>
  )
}
