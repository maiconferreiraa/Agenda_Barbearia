import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { enablePushNotifications } from '../lib/push'

const DISMISS_KEY = 'primer:push-dismissed'

export function EnablePush() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')

  const alreadyGranted =
    typeof Notification !== 'undefined' && Notification.permission === 'granted'

  if (dismissed || alreadyGranted || !user || typeof Notification === 'undefined') return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  async function handleEnable() {
    if (!user) return
    setStatus('loading')
    try {
      await enablePushNotifications(user.uid)
    } finally {
      setStatus('done')
      dismiss()
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-ink-border bg-gold/5 px-4 py-2 text-xs text-neutral-300">
      <span className="min-w-0 flex-1">
        Ative as notificações para receber avisos de agendamentos e pagamentos em tempo real.
      </span>
      <button
        onClick={handleEnable}
        disabled={status === 'loading'}
        className="shrink-0 rounded-md bg-gold px-2.5 py-1 font-medium text-ink hover:brightness-110 disabled:opacity-50"
      >
        Ativar
      </button>
      <button onClick={dismiss} className="shrink-0 text-neutral-500 hover:text-neutral-300">
        Agora não
      </button>
    </div>
  )
}
