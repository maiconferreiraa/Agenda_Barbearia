import type { Env } from './env'
import { Firestore, type Doc } from './firestore'
import { gfetch, googleToken } from './google'

export type NotificationType =
  | 'appointment_new'
  | 'appointment_canceled'
  | 'plan_chosen'
  | 'payment_received'
  | 'payment_failed'
  | 'plan_expiring'
  | 'plan_expired'
  | 'plan_canceled'
  | 'invoice_created'
  | 'payment_overdue'

export interface NotifyInput {
  type: NotificationType
  title: string
  message: string
  relatedId?: string
  targetRole?: 'owner'
  targetUserId?: string
  /** Rota do app aberta ao tocar no push. */
  link?: string
}

/** Grava no sininho do app e manda push (FCM) para os aparelhos do destinatário. */
export async function notify(env: Env, fs: Firestore, input: NotifyInput) {
  await fs.add('notifications', {
    type: input.type,
    title: input.title,
    message: input.message,
    relatedId: input.relatedId ?? null,
    targetRole: input.targetRole ?? null,
    targetUserId: input.targetUserId ?? null,
    link: input.link ?? null,
    read: false,
    createdAt: new Date(),
  })

  let users: Doc[] = []
  if (input.targetUserId) {
    const u = await fs.get(`users/${input.targetUserId}`)
    if (u) users = [u]
  } else if (input.targetRole === 'owner') {
    users = await fs.query('users', { where: [{ field: 'role', op: '==', value: 'owner' }] })
  }

  for (const user of users) {
    const tokens = (user.data.fcmTokens as string[] | undefined) ?? []
    if (tokens.length === 0) continue
    const dead: string[] = []
    for (const token of tokens.slice(0, 5)) {
      if (!(await sendPush(env, token, input))) dead.push(token)
    }
    if (dead.length > 0) {
      await fs.update(`users/${user.id}`, { fcmTokens: tokens.filter((t) => !dead.includes(t)) })
    }
  }
}

/** Devolve false só quando o aparelho não existe mais (token para remover). */
async function sendPush(env: Env, token: string, input: NotifyInput): Promise<boolean> {
  try {
    const access = await googleToken(env)
    const res = await gfetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: input.title, body: input.message },
          webpush: {
            notification: { icon: '/icons/icon-192.png' },
            fcm_options: { link: input.link ?? '/' },
          },
        },
      }),
    })
    if (res.status === 404) return false
    const body = res.ok ? '' : await res.text()
    return !body.includes('UNREGISTERED')
  } catch {
    return true
  }
}
