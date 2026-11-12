import { useState } from 'react'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Field'
import { callApi } from '../lib/api'
import { LINK_ACCOUNT_ENABLED } from '../lib/features'

const requestLinkCodeFn = callApi<Record<string, never>, { sent: boolean; phoneEnd: string }>('requestLinkCode')
const confirmLinkCodeFn = callApi<{ code: string }, { linked: boolean }>('confirmLinkCode')

/**
 * "Já é assinante?" — cliente que veio do sistema antigo liga o plano à conta
 * do app com um código que chega no WhatsApp. EM ESPERA (LINK_ACCOUNT_ENABLED).
 */
export function LinkAccountCard() {
  const [step, setStep] = useState<'idle' | 'code' | 'done'>('idle')
  const [phoneEnd, setPhoneEnd] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!LINK_ACCOUNT_ENABLED) return null

  async function ask() {
    setBusy(true)
    setError('')
    try {
      const r = await requestLinkCodeFn({})
      setPhoneEnd(r.data.phoneEnd)
      setStep('code')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function confirm() {
    setBusy(true)
    setError('')
    try {
      await confirmLinkCodeFn({ code })
      setStep('done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 text-sm">
      {step === 'done' ? (
        <p className="text-emerald-400">✅ Pronto! Seu plano já aparece aqui.</p>
      ) : (
        <>
          <p className="font-medium text-neutral-100">Já é assinante da barbearia?</p>
          <p className="text-neutral-400">
            Se o seu plano já existia antes do app, mandamos um código no seu WhatsApp para ligar ele à sua conta.
          </p>
          {step === 'idle' ? (
            <Button variant="secondary" loading={busy} onClick={ask}>
              Receber código no WhatsApp
            </Button>
          ) : (
            <div className="space-y-2">
              <Input
                label={`Código enviado para o WhatsApp terminado em ${phoneEnd}`}
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
              <Button className="w-full" loading={busy} disabled={code.length !== 6} onClick={confirm}>
                Confirmar
              </Button>
            </div>
          )}
          {error && <p className="text-red-400">{error}</p>}
        </>
      )}
    </Card>
  )
}
