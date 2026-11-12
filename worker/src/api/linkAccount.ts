import { ApiError } from '../env'
import type { Firestore } from '../firestore'
import { businessInfo, queueWhatsapp } from '../whatsapp'
import type { Ctx } from './ctx'

/**
 * Ligar a ficha importada (sistema antigo, sem login) à conta que o cliente
 * criou no app. Para ninguém pegar o plano de outra pessoa só digitando o
 * telefone dela, a ligação exige um código de 6 números mandado no WhatsApp
 * daquele telefone.
 *
 * EM ESPERA: o usuário pediu para deixar pronto mas desligado (12/11/2026).
 * Para ligar: LINK_ACCOUNT_ENABLED = true aqui e em app/src/lib/features.ts.
 */
export const LINK_ACCOUNT_ENABLED = false

const CODE_TTL_MS = 15 * 60 * 1000
const MAX_TRIES = 5

function assertEnabled() {
  if (!LINK_ACCOUNT_ENABLED) throw new ApiError('not-found', 'Rota não encontrada.')
}

async function sha(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Ficha importada (sem conta) com o mesmo telefone do cliente logado. */
async function findImportedFicha(fs: Firestore, uid: string) {
  const me = await fs.get(`users/${uid}`)
  const phone = typeof me?.data.phone === 'string' ? me.data.phone.replace(/\D/g, '').replace(/^55/, '') : ''
  if (!me || me.data.role !== 'client' || phone.length !== 11) return null
  const same = await fs.query('users', { where: [{ field: 'phone', op: '==', value: phone }], limit: 5 })
  const ficha = same.find((u) => u.id !== uid && u.data.imported === true && !u.data.hasAccount && u.data.role === 'client')
  return ficha ? { ficha, phone } : null
}

/** POST /api/requestLinkCode — manda o código no WhatsApp do telefone da conta. */
export async function requestLinkCode({ fs, uid }: Ctx) {
  assertEnabled()
  const found = await findImportedFicha(fs, uid)
  if (!found) {
    throw new ApiError('not-found', 'Não achamos plano do sistema antigo com o seu telefone. Fale com a barbearia.')
  }
  const code = String(Math.floor(100000 + Math.random() * 900000))
  await fs.set(`linkCodes/${uid}`, {
    codeHash: await sha(`${uid}:${code}`),
    fichaId: found.ficha.id,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    tries: 0,
  })
  const { name } = await businessInfo(fs)
  await queueWhatsapp(fs, {
    phone: found.phone,
    kind: 'link_code',
    relatedId: uid,
    text: `🔐 Seu código para ver o seu plano no app da ${name}: *${code}*\n\nVale por 15 minutos. Se não foi você que pediu, ignore.`,
  })
  return { sent: true, phoneEnd: found.phone.slice(-4) }
}

/** POST /api/confirmLinkCode { code } — confere e passa plano, horários e pagamentos para a conta. */
export async function confirmLinkCode({ fs, uid, data }: Ctx) {
  assertEnabled()
  const code = String(data.code ?? '').replace(/\D/g, '')
  const pending = await fs.get(`linkCodes/${uid}`)
  if (!pending) throw new ApiError('failed-precondition', 'Peça um código novo.')
  if ((pending.data.expiresAt as Date).getTime() < Date.now() || Number(pending.data.tries) >= MAX_TRIES) {
    throw new ApiError('failed-precondition', 'O código expirou. Peça um novo.')
  }
  if ((await sha(`${uid}:${code}`)) !== pending.data.codeHash) {
    await fs.update(pending.path, { tries: Number(pending.data.tries) + 1 })
    throw new ApiError('invalid-argument', 'Código errado. Confira no WhatsApp.')
  }

  const fichaId = String(pending.data.fichaId)
  const writes = []
  for (const col of ['subscriptions', 'appointments', 'invoices', 'payments', 'canceledAppointments']) {
    for (const d of await fs.query(col, { where: [{ field: 'clientId', op: '==', value: fichaId }], limit: 300 })) {
      writes.push(fs.updateWrite(d.path, { clientId: uid }))
    }
  }
  // a ficha antiga some da lista de clientes, mas fica guardada
  writes.push(fs.updateWrite(`users/${fichaId}`, { role: 'merged', mergedInto: uid, mergedAt: new Date() }))
  writes.push(fs.updateWrite(`users/${uid}`, { linkedFrom: fichaId }))
  writes.push(fs.deleteWrite(pending.path))
  for (let i = 0; i < writes.length; i += 400) await fs.commit(writes.slice(i, i + 400))
  return { linked: true, moved: writes.length - 3 }
}

