import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'
import { dayStartSlots, type BusinessHours } from '../lib/schedule'

export const getAvailableSlots = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Você precisa estar logado.')

  const serviceIds = request.data?.serviceIds as string[] | undefined
  const dateISO = request.data?.dateISO as string | undefined
  if (!serviceIds?.length || !dateISO) {
    throw new HttpsError('invalid-argument', 'serviceIds e dateISO são obrigatórios.')
  }
  const uniqueServiceIds = Array.from(new Set(serviceIds))

  const [serviceSnaps, settingsSnap] = await Promise.all([
    Promise.all(uniqueServiceIds.map((id) => db.collection('services').doc(id).get())),
    db.collection('businessSettings').doc('main').get(),
  ])
  if (serviceSnaps.some((s) => !s.exists)) {
    throw new HttpsError('not-found', 'Serviço não encontrado.')
  }
  const totalDuration = serviceSnaps.reduce(
    (sum, s) => sum + (s.data()!.durationMinutes as number),
    0,
  )
  const settings = settingsSnap.data() as BusinessHours | undefined
  if (!settings) return { slots: [] }

  const day = new Date(dateISO)
  day.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setHours(23, 59, 59, 999)

  const candidates = dayStartSlots(day, totalDuration, settings)
  if (candidates.length === 0) return { slots: [] }

  const busySnap = await db
    .collection('appointments')
    .where('date', '>=', Timestamp.fromDate(day))
    .where('date', '<=', Timestamp.fromDate(dayEnd))
    .get()

  const busyRanges = busySnap.docs
    .map((d) => d.data())
    .filter((a) => a.status !== 'canceled')
    .map((a) => {
      const start: Date = a.date.toDate()
      const startMin = start.getHours() * 60 + start.getMinutes()
      return { start: startMin, end: startMin + a.durationMinutes }
    })

  const free = candidates.filter((slot) => {
    const startMin = slot.getHours() * 60 + slot.getMinutes()
    const endMin = startMin + totalDuration
    return !busyRanges.some((b) => startMin < b.end && endMin > b.start)
  })

  return { slots: free.map((d) => d.toISOString()) }
})
