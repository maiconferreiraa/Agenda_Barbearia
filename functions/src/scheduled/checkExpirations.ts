import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db } from '../lib/admin'
import { REGION } from '../lib/region'
import { notify } from '../lib/notify'

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export const checkExpirations = onSchedule(
  { region: REGION, schedule: '0 9 * * *', timeZone: 'America/Sao_Paulo' },
  async () => {
    const snap = await db
      .collection('subscriptions')
      .where('status', 'in', ['active', 'past_due'])
      .get()

    const now = Date.now()

    for (const doc of snap.docs) {
      const sub = doc.data()
      const periodEnd = sub.currentPeriodEnd?.toDate?.() as Date | undefined
      if (!periodEnd) continue

      if (periodEnd.getTime() < now) {
        await doc.ref.update({ status: 'expired' })
        await notify({
          type: 'plan_expired',
          targetRole: 'owner',
          relatedId: doc.id,
          title: 'Plano vencido',
          message: `A assinatura de ${sub.clientName} (${sub.planName}) venceu e não foi renovada.`,
        })
        await notify({
          type: 'plan_expired',
          targetUserId: sub.clientId,
          relatedId: doc.id,
          title: 'Seu plano venceu',
          message: `Sua assinatura do plano "${sub.planName}" venceu. Renove para continuar usando os benefícios.`,
        })
        continue
      }

      const withinWarningWindow = periodEnd.getTime() - now <= THREE_DAYS_MS
      if (withinWarningWindow && !sub.expiringNotified) {
        await doc.ref.update({ expiringNotified: true })
        const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - now) / (24 * 60 * 60 * 1000)))
        await notify({
          type: 'plan_expiring',
          targetRole: 'owner',
          relatedId: doc.id,
          title: 'Plano vencendo em breve',
          message: `A assinatura de ${sub.clientName} (${sub.planName}) vence em ${daysLeft} dia(s).`,
        })
        await notify({
          type: 'plan_expiring',
          targetUserId: sub.clientId,
          relatedId: doc.id,
          title: 'Seu plano está vencendo',
          message: `Sua assinatura do plano "${sub.planName}" vence em ${daysLeft} dia(s).`,
        })
      }
    }
  },
)
