import { arrayUnion, doc, updateDoc } from 'firebase/firestore'
import { getToken, onMessage } from 'firebase/messaging'
import { db, getMessagingIfSupported } from '../firebase'

function swUrlWithConfig() {
  const params = new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  })
  return `/firebase-messaging-sw.js?${params.toString()}`
}

export async function enablePushNotifications(uid: string): Promise<'granted' | 'denied' | 'unsupported'> {
  const messaging = await getMessagingIfSupported()
  if (!messaging) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const registration = await navigator.serviceWorker.register(swUrlWithConfig(), {
    scope: '/fcm/',
  })

  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  })

  if (token) {
    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) })
  }

  onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? 'Barbearia Primer'
    const body = payload.notification?.body ?? ''
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-192.png' })
    }
  })

  return 'granted'
}
