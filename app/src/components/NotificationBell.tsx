import { useState } from 'react'
import { collection, doc, getDocs, limit, query, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import { formatDateTime } from '../lib/format'
import type { AppNotification } from '../types'

const ICONS: Record<AppNotification['type'], string> = {
  appointment_new: '📅',
  appointment_canceled: '🚫',
  plan_chosen: '⭐',
  payment_received: '💰',
  payment_failed: '⚠️',
  plan_expiring: '⏳',
  plan_expired: '🔴',
  plan_canceled: '🛑',
  invoice_created: '🧾',
  payment_overdue: '🚨',
  whatsapp_failed: '📵',
}

export function NotificationBell() {
  const { profile } = useAuth()
  const { data: notifications } = useNotifications(profile?.role, profile?.uid)
  const [open, setOpen] = useState(false)
  const unread = notifications.filter((n) => !n.read)

  async function markAllRead() {
    if (unread.length === 0) return
    const batch = writeBatch(db)
    unread.forEach((n) => batch.update(doc(db, 'notifications', n.id), { read: true }))
    await batch.commit()
  }

  const [clearing, setClearing] = useState(false)
  /** Apaga todo o histórico de notificações (em lotes, até acabar). */
  async function clearAll() {
    if (!profile || notifications.length === 0) return
    const quem = profile.role === 'owner' ? 'da barbearia (some para todas as contas de dono)' : 'suas'
    if (!confirm(`Apagar todas as notificações ${quem}? Não dá para desfazer.`)) return
    setClearing(true)
    try {
      const base = collection(db, 'notifications')
      const filtro =
        profile.role === 'owner' ? where('targetRole', '==', 'owner') : where('targetUserId', '==', profile.uid)
      for (;;) {
        const snap = await getDocs(query(base, filtro, limit(300)))
        if (snap.empty) break
        const batch = writeBatch(db)
        snap.docs.forEach((d) => batch.delete(d.ref))
        await batch.commit()
      }
    } catch (err) {
      alert('Não foi possível limpar agora. ' + (err as Error).message)
    } finally {
      setClearing(false)
    }
  }

  async function markRead(n: AppNotification) {
    if (n.read) return
    await updateDoc(doc(db, 'notifications', n.id), { read: true })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full border border-ink-border bg-ink-card p-2 text-gold-light hover:border-gold-dark"
        aria-label="Notificações"
      >
        🔔
        {unread.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-ink-border bg-ink-soft shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink-border px-3 py-2.5">
              <span className="text-sm font-medium text-gold-light">Notificações</span>
              <span className="flex items-center gap-3">
                <button onClick={markAllRead} className="text-xs text-neutral-400 hover:text-gold-light">
                  Marcar como lidas
                </button>
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    disabled={clearing}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {clearing ? 'Limpando…' : 'Limpar'}
                  </button>
                )}
              </span>
            </div>
            {notifications.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-neutral-500">Sem notificações por aqui.</p>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n)}
                className={`flex w-full gap-2.5 border-b border-ink-border/60 px-3 py-3 text-left last:border-0 hover:bg-ink-card ${
                  n.read ? 'opacity-60' : ''
                }`}
              >
                <span className="text-lg leading-none">{ICONS[n.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-neutral-100">{n.title}</span>
                  <span className="block text-xs text-neutral-400">{n.message}</span>
                  <span className="mt-1 block text-[10px] text-neutral-600">
                    {formatDateTime(n.createdAt)}
                  </span>
                </span>
                {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gold" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
