import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'

export const bookAppointment = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Você precisa estar logado.')

  const serviceId = request.data?.serviceId as string | undefined
  const dateISO = request.data?.dateISO as string | undefined
  if (!serviceId || !dateISO) {
    throw new HttpsError('invalid-argument', 'serviceId e dateISO são obrigatórios.')
  }

  const date = new Date(dateISO)
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() - 60_000) {
    throw new HttpsError('invalid-argument', 'Horário inválido.')
  }

  const [userSnap, serviceSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('services').doc(serviceId).get(),
  ])
  if (!userSnap.exists) throw new HttpsError('not-found', 'Usuário não encontrado.')
  const user = userSnap.data()!
  if (!serviceSnap.exists || serviceSnap.data()?.active !== true) {
    throw new HttpsError('not-found', 'Serviço indisponível.')
  }
  const service = serviceSnap.data()!

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
    const endMin = startMin + service.durationMinutes
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
    let usedPlanCredit = false
    let subscriptionId: string | undefined

    if (!subSnap.empty) {
      const subDoc = subSnap.docs[0]
      const sub = subDoc.data()
      const planSnap = await tx.get(db.collection('plans').doc(sub.planId))
      const included = (planSnap.data()?.includedServices ?? []) as {
        serviceId: string
        quantity: number
      }[]
      const rule = included.find((i) => i.serviceId === serviceId)
      const used = (sub.usage?.[serviceId] as number | undefined) ?? 0
      if (rule && used < rule.quantity) {
        usedPlanCredit = true
        subscriptionId = subDoc.id
        tx.update(subDoc.ref, { [`usage.${serviceId}`]: used + 1 })
      }
    }

    tx.set(appointmentRef, {
      clientId: uid,
      clientName: user.name,
      clientPhone: user.phone ?? null,
      serviceId,
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      price: service.price,
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
