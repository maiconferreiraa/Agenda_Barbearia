import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'

export const bookAppointment = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Você precisa estar logado.')

  const serviceIds = request.data?.serviceIds as string[] | undefined
  const dateISO = request.data?.dateISO as string | undefined
  if (!serviceIds?.length || !dateISO) {
    throw new HttpsError('invalid-argument', 'serviceIds e dateISO são obrigatórios.')
  }
  const uniqueServiceIds = Array.from(new Set(serviceIds))

  const date = new Date(dateISO)
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() - 60_000) {
    throw new HttpsError('invalid-argument', 'Horário inválido.')
  }

  const [userSnap, serviceSnaps] = await Promise.all([
    db.collection('users').doc(uid).get(),
    Promise.all(uniqueServiceIds.map((id) => db.collection('services').doc(id).get())),
  ])
  if (!userSnap.exists) throw new HttpsError('not-found', 'Usuário não encontrado.')
  const user = userSnap.data()!

  const services = serviceSnaps.map((snap, i) => {
    if (!snap.exists || snap.data()?.active !== true) {
      throw new HttpsError('not-found', 'Serviço indisponível.')
    }
    const data = snap.data() as { name: string; durationMinutes: number; price: number }
    return { id: uniqueServiceIds[i], ...data }
  })
  const totalDuration = services.reduce((sum, s) => sum + s.durationMinutes, 0)

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const activeSubQuery = db
    .collection('subscriptions')
    .where('clientId', '==', uid)
    .where('status', '==', 'active')
    .limit(1)

  const appointmentRef = db.collection('appointments').doc()

  const result = await db.runTransaction(async (tx) => {
    const daySnap = await tx.get(
      db
        .collection('appointments')
        .where('date', '>=', Timestamp.fromDate(dayStart))
        .where('date', '<=', Timestamp.fromDate(dayEnd)),
    )
    const startMin = date.getHours() * 60 + date.getMinutes()
    const endMin = startMin + totalDuration
    const overlaps = daySnap.docs
      .map((d) => d.data())
      .filter((a) => a.status !== 'canceled')
      .some((a) => {
        const s: Date = a.date.toDate()
        const sMin = s.getHours() * 60 + s.getMinutes()
        return startMin < sMin + a.durationMinutes && endMin > sMin
      })
    if (overlaps) {
      throw new HttpsError('already-exists', 'Esse horário acabou de ser ocupado. Escolha outro.')
    }

    const subSnap = await tx.get(activeSubQuery)
    let subscriptionId: string | undefined
    let subDocRef: FirebaseFirestore.DocumentReference | undefined
    let planIncluded: { serviceId: string; quantity: number }[] = []
    let usage: Record<string, number> = {}

    if (!subSnap.empty) {
      const subDoc = subSnap.docs[0]
      const sub = subDoc.data()
      subscriptionId = subDoc.id
      subDocRef = subDoc.ref
      const planSnap = await tx.get(db.collection('plans').doc(sub.planId))
      planIncluded = (planSnap.data()?.includedServices ?? []) as {
        serviceId: string
        quantity: number
      }[]
      usage = sub.usage ?? {}
    }

    const usageUpdates: Record<string, number> = {}
    const lines = services.map((s) => {
      const rule = planIncluded.find((i) => i.serviceId === s.id)
      const used = usage[s.id] ?? 0
      const usedPlanCredit = !!rule && used < rule.quantity
      if (usedPlanCredit) {
        usageUpdates[`usage.${s.id}`] = used + 1
      }
      return {
        serviceId: s.id,
        serviceName: s.name,
        durationMinutes: s.durationMinutes,
        price: s.price,
        usedPlanCredit,
      }
    })

    if (subDocRef && Object.keys(usageUpdates).length > 0) {
      tx.update(subDocRef, usageUpdates)
    }

    const totalPrice = lines.filter((l) => !l.usedPlanCredit).reduce((sum, l) => sum + l.price, 0)
    const usedPlanCredit = lines.some((l) => l.usedPlanCredit)

    tx.set(appointmentRef, {
      clientId: uid,
      clientName: user.name,
      clientPhone: user.phone ?? null,
      services: lines,
      serviceName: lines.map((l) => l.serviceName).join(' + '),
      durationMinutes: totalDuration,
      price: totalPrice,
      subscriptionId: subscriptionId ?? null,
      usedPlanCredit,
      date: Timestamp.fromDate(date),
      status: 'scheduled',
      createdAt: FieldValue.serverTimestamp(),
    })

    return { usedPlanCredit }
  })

  return { appointmentId: appointmentRef.id, usedPlanCredit: result.usedPlanCredit }
})
