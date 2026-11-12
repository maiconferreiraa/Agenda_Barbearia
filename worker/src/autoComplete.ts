import type { Env } from './env'
import { Firestore } from './firestore'
import { budget } from './google'
import { notify } from './notify'
import { spDayStart } from './time'

/**
 * Horários de dias anteriores que o dono não marcou (Concluído / Não compareceu)
 * viram "Concluído" sozinhos, com `autoCompleted: true` e forma de pagamento
 * desconhecida (sem taxa). O dono ainda pode trocar para "Não compareceu".
 */
export async function runAutoComplete(env: Env) {
  if (budget.used >= 44) return
  const fs = new Firestore(env)
  const todayStart = spDayStart(new Date())
  // filtra por status (índice simples) e confere a data aqui
  const open = await fs.query('appointments', {
    where: [{ field: 'status', op: 'in', value: ['scheduled', 'confirmed'] }],
    limit: 200,
  })
  const late = open.filter((d) => (d.data.date as Date).getTime() < todayStart.getTime())
  if (late.length === 0) return
  const writes = late.map((d) =>
    fs.updateWrite(d.path, { status: 'done', autoCompleted: true, paymentMethod: null, autoCompletedAt: new Date() }),
  )
  for (let i = 0; i < writes.length; i += 400) await fs.commit(writes.slice(i, i + 400))
  await notify(env, fs, {
    type: 'appointment_new',
    targetRole: 'owner',
    title: 'Atendimentos concluídos sozinhos',
    message:
      `${late.length} horário(s) de dias anteriores não tinham sido marcados e foram concluídos automaticamente. ` +
      'Se alguém faltou, abra a Agenda daquele dia e toque em "Não compareceu".',
    link: '/owner/agenda',
  })
}
