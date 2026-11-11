import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'

/**
 * Horário cancelado (pelo cliente no app ou pelo dono na agenda) → devolve
 * os créditos do plano que esse horário tinha usado.
 *
 * Só devolve se o crédito é do mês atual do plano (o horário foi marcado
 * depois do início do período); se o mês já virou, os créditos já zeraram.
 * `creditRefunded` evita devolver duas vezes.
 */
export const onAppointmentCanceled = onDocumentUpdated(
  { region: REGION, document: 'appointments/{appointmentId}' },
  async (event) => {
    const before = event.data?.before.data()
    const after = event.data?.after.data()
    if (!before || !after) return
    if (before.status === 'canceled' || after.status !== 'canceled') return
    if (!after.usedPlanCredit || !after.subscriptionId || after.creditRefunded) return

    const apptRef = event.data!.after.ref
    const subRef = db.collection('subscriptions').doc(after.subscriptionId)

    await db.runTransaction(async (tx) => {
      const [apptSnap, subSnap] = await Promise.all([tx.get(apptRef), tx.get(subRef)])
      const appt = apptSnap.data()
      const sub = subSnap.data()
      if (!appt || appt.creditRefunded || !sub) return

      const periodStart = sub.currentPeriodStart?.toDate?.() as Date | undefined
      const bookedAt = appt.createdAt?.toDate?.() as Date | undefined
      const sameCycle = !!periodStart && !!bookedAt && bookedAt.getTime() >= periodStart.getTime()

      if (sameCycle) {
        const usage: Record<string, number> = { ...(sub.usage ?? {}) }
        const updates: Record<string, number> = {}
        for (const line of appt.services ?? []) {
          if (!line.usedPlanCredit) continue
          const current = updates[`usage.${line.serviceId}`] ?? usage[line.serviceId] ?? 0
          updates[`usage.${line.serviceId}`] = Math.max(0, current - 1)
        }
        if (Object.keys(updates).length > 0) tx.update(subRef, updates)
      }
      tx.update(apptRef, {
        creditRefunded: sameCycle,
        creditRefundCheckedAt: FieldValue.serverTimestamp(),
      })
    })
    logger.info('Créditos do horário cancelado verificados', { appointmentId: event.params.appointmentId })
  },
)
