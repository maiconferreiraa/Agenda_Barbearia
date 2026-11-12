import { ApiError } from '../env'
import { gfetch, googleToken } from '../google'
import { PHONE_RULE, strictPhoneBr } from '../whatsapp'
import type { Ctx } from './ctx'
import { requireOwner, requireStaff } from './ctx'
import { normalizeUsername } from './username'

/**
 * Equipe: o dono cadastra colaboradores (role 'barber'). Cada um entra com o
 * próprio usuário e vê só a agenda, os clientes e a produção dele. O dono vê tudo.
 * O e-mail do colaborador é interno (usuario@equipe.barbearia-prime.app): ele
 * entra pelo usuário.
 */
function percent(v: unknown) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new ApiError('invalid-argument', 'Comissão deve ser de 0 a 100%.')
  return Math.round(n * 100) / 100
}

function safeId(v: unknown) {
  const id = String(v ?? '')
  if (!id || id.includes('/')) throw new ApiError('invalid-argument', 'Colaborador inválido.')
  return id
}

/** POST /api/createCollaborator { name, phone, username, password, commissionPercent } */
export async function createCollaborator(ctx: Ctx) {
  const { env, fs, data } = ctx
  await requireOwner(ctx)
  const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ').slice(0, 60) : ''
  if (name.length < 2) throw new ApiError('invalid-argument', 'Digite o nome do colaborador.')
  const phone = strictPhoneBr(data.phone)
  if (!phone) throw new ApiError('invalid-argument', PHONE_RULE)
  const username = normalizeUsername(data.username)
  if (!username) throw new ApiError('invalid-argument', 'Usuário inválido: letras, números, ponto ou _ (3 a 30).')
  const password = typeof data.password === 'string' ? data.password : ''
  if (password.length < 6) throw new ApiError('invalid-argument', 'A senha precisa ter pelo menos 6 caracteres.')
  const commissionPercent = percent(data.commissionPercent ?? 0)
  if (await fs.get(`usernames/${username}`)) throw new ApiError('already-exists', 'Esse usuário já existe. Escolha outro.')

  const email = `${username}@equipe.barbearia-prime.app`
  const res = await gfetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${env.FIREBASE_WEB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: name, returnSecureToken: false }),
  })
  const body = (await res.json()) as { localId?: string; error?: { message?: string } }
  if (!res.ok || !body.localId) {
    throw new ApiError(
      body.error?.message?.includes('EMAIL_EXISTS') ? 'already-exists' : 'internal',
      body.error?.message?.includes('EMAIL_EXISTS') ? 'Esse usuário já existe. Escolha outro.' : 'Não foi possível criar o acesso do colaborador.',
    )
  }
  const uid = body.localId
  const now = new Date()
  await fs.commit([
    fs.createWrite(`users/${uid}`, {
      uid,
      name,
      email,
      phone,
      role: 'barber',
      username,
      attends: true,
      active: true,
      commissionPercent,
      createdAt: now,
    }),
    fs.createWrite(`usernames/${username}`, { uid, createdAt: now }),
  ])
  return { uid, username }
}

/** POST /api/updateTeamMember { id, attends?, commissionPercent?, active?, name? } — dono (inclusive "Eu também atendo"). */
export async function updateTeamMember(ctx: Ctx) {
  const { fs, data } = ctx
  await requireOwner(ctx)
  const id = safeId(data.id)
  const member = await fs.get(`users/${id}`)
  if (!member || !['owner', 'barber'].includes(String(member.data.role))) throw new ApiError('not-found', 'Colaborador não encontrado.')
  const update: Record<string, unknown> = {}
  if (typeof data.attends === 'boolean') update.attends = data.attends
  if (data.commissionPercent !== undefined) update.commissionPercent = percent(data.commissionPercent)
  if (typeof data.active === 'boolean' && member.data.role === 'barber') update.active = data.active
  if (typeof data.name === 'string' && data.name.trim().length >= 2) update.name = data.name.trim().slice(0, 60)
  if (Object.keys(update).length === 0) return { ok: true }
  await fs.update(member.path, update)
  return { ok: true }
}

/** POST /api/setCollaboratorPassword { id, password } — dono troca a senha de um colaborador. */
export async function setCollaboratorPassword(ctx: Ctx) {
  const { env, fs, data } = ctx
  await requireOwner(ctx)
  const id = safeId(data.id)
  const member = await fs.get(`users/${id}`)
  if (member?.data.role !== 'barber') throw new ApiError('not-found', 'Colaborador não encontrado.')
  const password = typeof data.password === 'string' ? data.password : ''
  if (password.length < 6) throw new ApiError('invalid-argument', 'A senha precisa ter pelo menos 6 caracteres.')
  const token = await googleToken(env)
  const res = await gfetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ localId: id, password }),
  })
  if (!res.ok) throw new ApiError('internal', 'Não foi possível trocar a senha agora.')
  return { ok: true }
}

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))

/**
 * POST /api/setWorkSchedule { id, schedule } — dias, horários e almoço de quem atende.
 * O colaborador muda o dele; o dono muda o de qualquer um (inclusive o próprio).
 * `schedule: null` volta a usar o horário da barbearia.
 */
export async function setWorkSchedule(ctx: Ctx) {
  const { fs, data, uid } = ctx
  const { isOwner } = await requireStaff(ctx)
  const id = safeId(data.id)
  if (!isOwner && id !== uid) throw new ApiError('permission-denied', 'Você só pode mudar o seu horário.')
  const member = await fs.get(`users/${id}`)
  if (!member || !['owner', 'barber'].includes(String(member.data.role))) throw new ApiError('not-found', 'Colaborador não encontrado.')
  if (data.schedule === null) {
    await fs.update(member.path, { schedule: null })
    return { ok: true }
  }
  const raw = data.schedule as { hours?: Record<string, { enabled?: unknown; open?: unknown; close?: unknown }>; lunch?: { enabled?: unknown; start?: unknown; end?: unknown } }
  if (!raw || typeof raw !== 'object' || !raw.hours) throw new ApiError('invalid-argument', 'Horário inválido.')
  const hours: Record<string, { enabled: boolean; open: string; close: string }> = {}
  for (const k of WEEK) {
    const d = raw.hours[k] ?? {}
    const open = String(d.open ?? '09:00')
    const close = String(d.close ?? '19:00')
    if (!HHMM.test(open) || !HHMM.test(close)) throw new ApiError('invalid-argument', 'Horário inválido.')
    const enabled = d.enabled === true
    if (enabled && mins(close) <= mins(open)) throw new ApiError('invalid-argument', 'A saída precisa ser depois da entrada.')
    hours[k] = { enabled, open, close }
  }
  const l = raw.lunch ?? {}
  const lunch = { enabled: l.enabled === true, start: String(l.start ?? '12:00'), end: String(l.end ?? '13:00') }
  if (!HHMM.test(lunch.start) || !HHMM.test(lunch.end)) throw new ApiError('invalid-argument', 'Horário de almoço inválido.')
  if (lunch.enabled && mins(lunch.end) <= mins(lunch.start)) throw new ApiError('invalid-argument', 'O fim do almoço precisa ser depois do início.')
  await fs.update(member.path, { schedule: { hours, lunch } })
  return { ok: true }
}
