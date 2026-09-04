import { FieldValue } from 'firebase-admin/firestore'
import { db, messaging } from './admin'

export type NotificationType =
  | 'appointment_new'
  | 'appointment_canceled'
  | 'plan_chosen'
  | 'payment_received'
  | 'payment_failed'
  | 'plan_expiring'
  | 'plan_expired'
  | 'plan_canceled'

interface NotifyInput {
  type: NotificationType
  title: string
  message: string
  relatedId?: string
  targetRole?: 'owner'
  targetUserId?: string
}

export async function notify(input: NotifyInput) {
  await db.collection('notifications').add({
    type: input.type,
    title: input.title,
    message: input.message,
    relatedId: input.relatedId ?? null,
    targetRole: input.targetRole ?? null,
    targetUserId: input.targetUserId ?? null,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  })

  const tokens = await resolveTokens(input)
  if (tokens.length === 0) return

  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: input.title, body: input.message },
    webpush: {
      notification: { icon: '/icons/icon-192.png' },
      fcmOptions: { link: '/' },
    },
  })

  const invalid: string[] = []
  res.responses.forEach((r, i) => {
    if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
      invalid.push(tokens[i])
    }
  })
  if (invalid.length > 0) await pruneTokens(invalid)
}

async function resolveTokens(input: NotifyInput): Promise<string[]> {
  if (input.targetUserId) {
    const snap = await db.collection('users').doc(input.targetUserId).get()
    return (snap.data()?.fcmTokens as string[] | undefined) ?? []
  }
  if (input.targetRole === 'owner') {
    const snap = await db.collection('users').where('role', '==', 'owner').get()
    return snap.docs.flatMap((d) => (d.data().fcmTokens as string[] | undefined) ?? [])
  }
  return []
}

async function pruneTokens(invalidTokens: string[]) {
  const snap = await db
    .collection('users')
    .where('fcmTokens', 'array-contains-any', invalidTokens.slice(0, 10))
    .get()
  const batch = db.batch()
  snap.docs.forEach((d) => {
    batch.update(d.ref, { fcmTokens: FieldValue.arrayRemove(...invalidTokens) })
  })
  if (!snap.empty) await batch.commit()
}
