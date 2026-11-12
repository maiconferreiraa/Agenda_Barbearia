import { ApiError } from '../env'
import type { Ctx } from './ctx'
import { requireOwner, requireStaff } from './ctx'
import type { Data, Firestore } from '../firestore'
import { notify } from '../notify'
import { PHONE_RULE, businessInfo, firstName, queueWhatsapp, strictPhoneBr } from '../whatsapp'
import { DAY_MS, brl, formatDateTimeBr, sp, spDate, spDayStart } from '../time'

/** Antecedência mínima para o cliente desmarcar sozinho (mesmo valor no app). */
export const CLIENT_CANCEL_MIN_HOURS = 2

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

interface DayHours {
  enabled: boolean
  open: string
  close: string
}

/** Mesmo padrão do app (app/src/lib/schedule.ts) — vale enquanto o dono não salvar Configurações. */
const DEFAULT_SETTINGS: Data = {
  slotDurationMinutes: 60,
  hours: {
    mon: { enabled: true, open: '09:00', close: '19:00' },
    tue: { enabled: true, open: '09:00', close: '19:00' },
    wed: { enabled: true, open: '09:00', close: '19:00' },
    thu: { enabled: true, open: '09:00', close: '19:00' },
    fri: { enabled: true, open: '09:00', close: '19:00' },
    sat: { enabled: true, open: '09:00', close: '17:00' },
    sun: { enabled: false, open: '09:00', close: '13:00' },
  },
  // Pausa de todo dia (almoço): ninguém marca nesse intervalo.
  lunch: { enabled: true, start: '12:00', end: '13:00' },
}

async function loadSettings(fs: Firestore): Promise<Data> {
  const saved = (await fs.get('businessSettings/main'))?.data
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
}

/** Almoço do dia como intervalo ocupado (minutos do dia). */
function lunchRange(settings: Data): Range[] {
  const l = settings.lunch as { enabled?: boolean; start?: string; end?: string } | undefined
  if (!l?.enabled || !l.start || !l.end) return []
  const start = toMinutes(l.start)
  const end = toMinutes(l.end)
  return end > start ? [{ start, end }] : []
}

interface Range {
  start: number
  end: number
}

function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Horários livres do dia (minutos, Brasília) para um atendimento de `duration` min.
 * Anda da abertura em passos do próprio serviço (Barba 30 min → 8:00, 8:30…);
 * ao bater num horário ocupado, almoço ou bloqueio, continua logo depois dele.
 */
function freeStarts(day: Date, duration: number, settings: Data, busy: Range[]): number[] {
  const p = sp(day)
  const hours = (settings.hours as Record<string, DayHours> | undefined)?.[WEEKDAY_KEYS[p.weekday]]
  if (!hours?.enabled || duration <= 0) return []
  const open = toMinutes(hours.open)
  const close = toMinutes(hours.close)

  const now = sp(new Date())
  const isToday = now.year === p.year && now.month === p.month && now.day === p.day
  const out: number[] = []
  let t = open
  while (t + duration <= close) {
    const hit = busy.filter((b) => t < b.end && t + duration > b.start)
    if (hit.length > 0) {
      t = Math.max(...hit.map((b) => b.end))
      continue
    }
    if (!isToday || t > now.minutes) out.push(t)
    t += duration
  }
  return out
}

async function loadServices(fs: Firestore, serviceIds: unknown) {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    throw new ApiError('invalid-argument', 'Escolha pelo menos um serviço.')
  }
  const ids = Array.from(new Set(serviceIds.map(String))).slice(0, 10)
  const docs = await Promise.all(ids.map((id) => fs.get(`services/${id}`)))
  return docs.map((d, i) => {
    if (!d || d.data.active !== true) throw new ApiError('not-found', 'Serviço indisponível.')
    return {
      id: ids[i],
      name: String(d.data.name),
      durationMinutes: Number(d.data.durationMinutes),
      price: Number(d.data.price),
    }
  })
}

/** Quem atende (dono com "Eu também atendo" e colaboradores ativos). Vazio = agenda única. */
export interface Barber {
  id: string
  name: string
  /** Dias/horários e almoço próprios (sem = os da barbearia). */
  schedule?: Data | null
}
export async function listBarbers(fs: Firestore): Promise<Barber[]> {
  const docs = await fs.query('users', { where: [{ field: 'attends', op: '==', value: true }], limit: 50 })
  return docs
    .filter((d) => (d.data.role === 'owner' || d.data.role === 'barber') && d.data.active !== false)
    .map((d) => ({
      id: d.id,
      name: String(d.data.name ?? '').trim() || 'Barbeiro',
      owner: d.data.role === 'owner',
      schedule: (d.data.schedule as Data | null | undefined) ?? null,
    }))
    .sort((a, b) => Number(b.owner) - Number(a.owner) || a.name.localeCompare(b.name, 'pt-BR'))
    .map(({ id, name, schedule }) => ({ id, name, schedule }))
}

/** Horário que vale para o barbeiro: o dele, se configurou; senão o da barbearia. */
function scheduleFor(settings: Data, barber?: Barber | null): Data {
  const own = barber?.schedule as { hours?: Data; lunch?: Data } | null | undefined
  if (!own?.hours) return settings
  return { ...settings, hours: own.hours, lunch: own.lunch ?? { enabled: false, start: '12:00', end: '13:00' } }
}

/** Dentro do horário de trabalho do dia (abertura–fechamento)? */
function withinHours(settings: Data, date: Date, start: number, end: number) {
  const hours = (settings.hours as Record<string, DayHours> | undefined)?.[WEEKDAY_KEYS[sp(date).weekday]]
  return !!hours?.enabled && start >= toMinutes(hours.open) && end <= toMinutes(hours.close)
}

/** Horários/bloqueios do dia que ocupam a agenda de um barbeiro. Sem barberId = da agenda do 1º barbeiro (antigos) / bloqueio da barbearia toda. */
function busyFor(barberId: string, defaultBarber: string, appts: { data: Data }[], blocks: { data: Data }[]) {
  return [
    ...busyRanges(appts.filter((a) => ((a.data.barberId as string | null | undefined) ?? defaultBarber) === barberId)),
    ...busyRanges(blocks.filter((b) => !b.data.barberId || b.data.barberId === barberId)),
  ]
}

function busyRanges(docs: { data: Data }[]): Range[] {
  return docs
    .map((d) => d.data)
    .filter((a) => a.status !== 'canceled')
    .map((a) => {
      const start = sp(a.date as Date).minutes
      return { start, end: start + Number(a.durationMinutes) }
    })
}

function dayRange(date: Date) {
  const start = spDayStart(date)
  return [
    { field: 'date', op: '>=' as const, value: start },
    { field: 'date', op: '<' as const, value: new Date(start.getTime() + DAY_MS) },
  ]
}

export async function getAvailableSlots({ fs, data }: Ctx) {
  const services = await loadServices(fs, data.serviceIds)
  const day = new Date(String(data.dateISO))
  if (Number.isNaN(day.getTime())) throw new ApiError('invalid-argument', 'Data inválida.')
  const duration = services.reduce((s, x) => s + x.durationMinutes, 0)

  const settings = await loadSettings(fs)
  const [appts, blockDocs, barbers] = await Promise.all([
    fs.query('appointments', { where: dayRange(day) }),
    fs.query('agendaBlocks', { where: dayRange(day) }),
    listBarbers(fs),
  ])
  const p = sp(day)
  const toIso = (start: number) => spDate(p.year, p.month, p.day, start).toISOString()
  if (barbers.length === 0) {
    const busy = [...busyRanges(appts), ...busyRanges(blockDocs), ...lunchRange(settings)]
    return { slots: freeStarts(day, duration, settings, busy).map(toIso) }
  }
  // um barbeiro escolhido, ou "sem preferência" = qualquer um livre
  const wanted = typeof data.barberId === 'string' && data.barberId !== 'any' ? data.barberId : null
  const pool = wanted ? barbers.filter((b) => b.id === wanted) : barbers
  if (pool.length === 0) throw new ApiError('not-found', 'Esse barbeiro não está atendendo.')
  const all = new Set<number>()
  for (const b of pool) {
    const own = scheduleFor(settings, b)
    const busy = [...busyFor(b.id, barbers[0].id, appts, blockDocs), ...lunchRange(own)]
    for (const s of freeStarts(day, duration, own, busy)) all.add(s)
  }
  return { slots: [...all].sort((a, b) => a - b).map(toIso) }
}

interface BookInput {
  /** null = cliente sem cadastro (marcado pelo dono só com nome/telefone). */
  clientId: string | null
  clientName: string
  clientPhone: string | null
  serviceIds: unknown
  date: Date
  /** 'auto' (cliente): usa crédito quando tiver; 'plan' (dono): exige crédito; 'walk_in': cobra tudo. */
  payMode: 'auto' | 'plan' | 'walk_in'
  bookedBy: 'client' | 'owner' | 'guest' | 'barber'
  /** Barbeiro escolhido; 'any'/vazio = o que estiver livre (o menos ocupado do dia). */
  barberId?: string | null
}

/** Cria o horário numa transação: confere se está livre e desconta crédito do plano. */
async function createAppointment(fs: Firestore, input: BookInput) {
  const { date } = input
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() - 60_000) {
    throw new ApiError('invalid-argument', 'Horário inválido.')
  }
  const services = await loadServices(fs, input.serviceIds)
  const totalDuration = services.reduce((s, x) => s + x.durationMinutes, 0)
  const appointmentId = fs.newId()
  const [settings, barbers] = await Promise.all([loadSettings(fs), listBarbers(fs)])
  const wanted = input.barberId && input.barberId !== 'any' ? input.barberId : null
  if (wanted && barbers.length > 0 && !barbers.some((b) => b.id === wanted)) {
    throw new ApiError('not-found', 'Esse barbeiro não está atendendo.')
  }

  const appointment = await fs.runTransaction(async (tx) => {
    const dayDocs = await tx.query('appointments', { where: dayRange(date) })
    const blockDocs = await tx.query('agendaBlocks', { where: dayRange(date) })
    const start = sp(date).minutes
    const end = start + totalDuration
    const hits = (r: Range[]) => r.some((b) => start < b.end && end > b.start)
    // cliente só marca dentro do horário de quem atende; a equipe pode encaixar fora dele
    const fromClient = input.bookedBy === 'client' || input.bookedBy === 'guest'
    let barber: Barber | null = null
    if (barbers.length === 0) {
      if (hits(lunchRange(settings))) {
        throw new ApiError('failed-precondition', 'Esse horário está bloqueado na agenda (almoço ou bloqueio). Escolha outro.')
      }
      if (hits(busyRanges(dayDocs))) throw new ApiError('already-exists', 'Esse horário acabou de ser ocupado. Escolha outro.')
      if (hits(busyRanges(blockDocs))) {
        throw new ApiError('failed-precondition', 'Esse horário está bloqueado na agenda (almoço ou bloqueio). Escolha outro.')
      }
    } else {
      const pool = (wanted ? barbers.filter((b) => b.id === wanted) : barbers).filter(
        (b) => !fromClient || withinHours(scheduleFor(settings, b), date, start, end),
      )
      if (pool.length === 0) {
        throw new ApiError('failed-precondition', 'Esse horário está fora do expediente. Escolha outro.')
      }
      const blockedFor = (b: Barber) =>
        hits(lunchRange(scheduleFor(settings, b))) ||
        hits(busyRanges(blockDocs.filter((x) => !x.data.barberId || x.data.barberId === b.id)))
      const free = pool.filter((b) => !blockedFor(b) && !hits(busyFor(b.id, barbers[0].id, dayDocs, blockDocs)))
      if (free.length === 0) {
        const blocked = pool.every(blockedFor)
        throw blocked
          ? new ApiError('failed-precondition', 'Esse horário está bloqueado na agenda (almoço ou bloqueio). Escolha outro.')
          : new ApiError('already-exists', 'Esse horário acabou de ser ocupado. Escolha outro.')
      }
      // sem preferência: o menos ocupado do dia
      const load = (id: string) => dayDocs.filter((a) => ((a.data.barberId as string | undefined) ?? barbers[0].id) === id).length
      barber = free.sort((a, b) => load(a.id) - load(b.id))[0]
    }

    let subscriptionId: string | null = null
    let included: { serviceId: string; quantity: number }[] = []
    let usage: Record<string, number> = {}
    if (input.clientId && input.payMode !== 'walk_in') {
      const subs = await tx.query('subscriptions', {
        where: [
          { field: 'clientId', op: '==', value: input.clientId },
          { field: 'status', op: '==', value: 'active' },
        ],
        limit: 1,
      })
      if (subs.length > 0) {
        subscriptionId = subs[0].id
        usage = (subs[0].data.usage as Record<string, number>) ?? {}
        const plan = await tx.get(`plans/${subs[0].data.planId}`)
        included = (plan?.data.includedServices as typeof included) ?? []
      }
    }

    const usageUpdates: Data = {}
    const lines = services.map((s) => {
      const rule = included.find((i) => i.serviceId === s.id)
      const used = usage[s.id] ?? 0
      const usedPlanCredit = !!rule && used < rule.quantity
      if (usedPlanCredit) usageUpdates[`usage.${s.id}`] = used + 1
      return { serviceId: s.id, serviceName: s.name, durationMinutes: s.durationMinutes, price: s.price, usedPlanCredit }
    })
    const usedPlanCredit = lines.some((l) => l.usedPlanCredit)
    if (input.payMode === 'plan' && !usedPlanCredit) {
      throw new ApiError(
        'failed-precondition',
        subscriptionId
          ? 'O plano desse cliente não tem crédito sobrando pra esse serviço. Marque como avulso.'
          : 'Esse cliente não tem plano ativo. Marque como avulso.',
      )
    }
    if (subscriptionId && Object.keys(usageUpdates).length > 0) {
      tx.update(`subscriptions/${subscriptionId}`, usageUpdates)
    }

    const appt = {
      clientId: input.clientId,
      clientName: input.clientName,
      clientPhone: input.clientPhone,
      services: lines,
      serviceName: lines.map((l) => l.serviceName).join(' + '),
      durationMinutes: totalDuration,
      price: lines.filter((l) => !l.usedPlanCredit).reduce((s, l) => s + l.price, 0),
      subscriptionId: usedPlanCredit ? subscriptionId : null,
      usedPlanCredit,
      date,
      status: 'scheduled',
      bookedBy: input.bookedBy,
      barberId: barber?.id ?? null,
      barberName: barber?.name ?? null,
      createdAt: new Date(),
    }
    tx.create(`appointments/${appointmentId}`, appt)
    return appt
  })
  return { appointmentId, appointment }
}

export async function bookAppointment({ env, fs, uid, data }: Ctx) {
  const user = await fs.get(`users/${uid}`)
  if (!user) throw new ApiError('not-found', 'Usuário não encontrado.')
  const date = new Date(String(data.dateISO))
  const { appointmentId, appointment } = await createAppointment(fs, {
    clientId: uid,
    clientName: String(user.data.name ?? 'Cliente'),
    clientPhone: (user.data.phone as string | undefined) ?? null,
    serviceIds: data.serviceIds,
    date,
    payMode: 'auto',
    bookedBy: 'client',
    barberId: typeof data.barberId === 'string' ? data.barberId : null,
  })

  await notify(env, fs, {
    type: 'appointment_new',
    targetRole: 'owner',
    relatedId: appointmentId,
    title: 'Novo agendamento',
    message: `${appointment.clientName} agendou ${appointment.serviceName} em ${formatDateTimeBr(date)}.`,
  })
  if (appointment.clientPhone) {
    await confirmByWhatsapp(fs, appointmentId, appointment.clientName, appointment.clientPhone, appointment)
  }
  await notifyBarber(env, fs, appointmentId, appointment)
  return { appointmentId, usedPlanCredit: appointment.usedPlanCredit }
}

async function confirmByWhatsapp(
  fs: Firestore,
  appointmentId: string,
  clientName: string,
  phone: string,
  appointment: { serviceName: string; usedPlanCredit: boolean; price: number; date: Date; barberName?: string | null },
) {
  const { name } = await businessInfo(fs)
  await queueWhatsapp(fs, {
    phone,
    kind: 'appointment_booked',
    relatedId: appointmentId,
    text:
      `✂️ Olá, ${firstName(clientName)}! Seu horário na ${name} está marcado:\n` +
      `*${appointment.serviceName}* — ${formatDateTimeBr(appointment.date)}` +
      (appointment.barberName ? ` com *${appointment.barberName}*.` : '.') +
      (appointment.usedPlanCredit
        ? '\nUsando crédito do seu plano.'
        : `\nValor: ${brl(appointment.price)} (pago na barbearia).`) +
      '\n\nSe não puder vir, avise com antecedência. Até lá!',
  })
}

/** Avisa o colaborador no sininho quando um horário cai na agenda dele (o dono já recebe pelos avisos da barbearia). */
async function notifyBarber(env: Ctx['env'], fs: Firestore, appointmentId: string, a: { barberId?: string | null; clientName: string; serviceName: string; date: Date }, skipUid?: string) {
  if (!a.barberId || a.barberId === skipUid) return
  const b = await fs.get(`users/${a.barberId}`)
  if (b?.data.role !== 'barber') return
  await notify(env, fs, {
    type: 'appointment_new',
    targetUserId: a.barberId,
    relatedId: appointmentId,
    link: '/barber',
    title: 'Novo horário na sua agenda',
    message: `${a.clientName} — ${a.serviceName} em ${formatDateTimeBr(a.date)}.`,
  })
}

/**
 * Dono marca pelo cliente (balcão/telefone). `clientId` de um cliente cadastrado
 * ou `clientName` (+ telefone) para quem não tem conta. `payMode`: 'plan' ou 'walk_in'.
 */
export async function ownerBookAppointment(ctx: Ctx) {
  const { env, fs, data, uid } = ctx
  const { isOwner } = await requireStaff(ctx)
  // colaborador marca só na agenda dele; o crédito do plano é usado sozinho quando o cliente tem
  const payMode: BookInput['payMode'] = isOwner
    ? data.payMode === 'plan' ? 'plan' : 'walk_in'
    : data.payMode === 'walk_in' ? 'walk_in' : 'auto'
  const date = new Date(String(data.dateISO))

  let clientId: string | null = null
  let clientName = typeof data.clientName === 'string' ? data.clientName.trim().slice(0, 80) : ''
  let clientPhone: string | null = null
  if (typeof data.clientPhone === 'string' && data.clientPhone.trim()) {
    clientPhone = strictPhoneBr(data.clientPhone)
    if (!clientPhone) throw new ApiError('invalid-argument', PHONE_RULE)
  }

  if (typeof data.clientId === 'string' && data.clientId) {
    if (data.clientId.includes('/')) throw new ApiError('invalid-argument', 'Cliente inválido.')
    const user = await fs.get(`users/${data.clientId}`)
    if (!user) throw new ApiError('not-found', 'Cliente não encontrado.')
    clientId = data.clientId
    clientName = String(user.data.name ?? 'Cliente')
    clientPhone = (user.data.phone as string | undefined) ?? clientPhone
  } else if (!clientName) {
    throw new ApiError('invalid-argument', 'Escolha o cliente ou digite o nome dele.')
  } else if (payMode === 'plan') {
    throw new ApiError('failed-precondition', 'Cliente sem cadastro não tem plano. Marque como avulso.')
  }

  const { appointmentId, appointment } = await createAppointment(fs, {
    clientId,
    clientName,
    clientPhone,
    serviceIds: data.serviceIds,
    date,
    payMode,
    bookedBy: isOwner ? 'owner' : 'barber',
    barberId: isOwner ? (typeof data.barberId === 'string' ? data.barberId : null) : uid,
  })

  // Avisa o cliente (no app, se tiver conta, e no WhatsApp, se tiver número).
  const when = formatDateTimeBr(date)
  if (clientId) {
    await notify(env, fs, {
      type: 'appointment_new',
      targetUserId: clientId,
      relatedId: appointmentId,
      link: '/app/appointments',
      title: 'Horário marcado pela barbearia',
      message: `${appointment.serviceName} em ${when}.` + (appointment.usedPlanCredit ? ' Usando crédito do seu plano.' : ''),
    })
  }
  if (clientPhone) await confirmByWhatsapp(fs, appointmentId, clientName, clientPhone, appointment)
  await notifyBarber(env, fs, appointmentId, appointment, uid)
  return { appointmentId, usedPlanCredit: appointment.usedPlanCredit }
}

/**
 * Horário cancelado → devolve os créditos do plano que ele usou (se o crédito é
 * do mês atual do plano) e APAGA o horário. Fica só um resumo em
 * `canceledAppointments/{id}`, que aparece no relatório financeiro.
 */
async function cancelWithRefund(fs: Firestore, appointmentId: string, extra: { canceledBy: 'client' | 'owner' }) {
  return fs.runTransaction(async (tx) => {
    const appt = await tx.get(`appointments/${appointmentId}`)
    if (!appt) throw new ApiError('not-found', 'Esse horário já foi cancelado.')
    const a = appt.data

    let creditReturned = false
    if (a.usedPlanCredit && a.subscriptionId && !a.creditRefunded) {
      const sub = await tx.get(`subscriptions/${a.subscriptionId}`)
      const periodStart = sub?.data.currentPeriodStart as Date | undefined
      const bookedAt = a.createdAt as Date | undefined
      if (sub && periodStart && bookedAt && bookedAt.getTime() >= periodStart.getTime()) {
        const usage = (sub.data.usage as Record<string, number>) ?? {}
        const updates: Data = {}
        for (const line of (a.services as { serviceId: string; usedPlanCredit: boolean }[]) ?? []) {
          if (!line.usedPlanCredit) continue
          const key = `usage.${line.serviceId}`
          const current = (updates[key] as number | undefined) ?? usage[line.serviceId] ?? 0
          updates[key] = Math.max(0, current - 1)
        }
        if (Object.keys(updates).length > 0) {
          tx.update(sub.path, updates)
          creditReturned = true
        }
      }
    }
    tx.create(`canceledAppointments/${appointmentId}`, cancelRecord(a, extra.canceledBy, creditReturned))
    tx.delete(appt.path)
    return { appt: a, creditReturned }
  })
}

/** O que sobra de um horário cancelado: só o necessário para o relatório. */
export function cancelRecord(a: Data, canceledBy: string, creditReturned: boolean, canceledAt = new Date()): Data {
  return {
    date: a.date,
    clientId: a.clientId ?? null,
    clientName: a.clientName ?? '',
    serviceName: a.serviceName ?? '',
    price: Number(a.price) || 0,
    usedPlanCredit: !!a.usedPlanCredit,
    creditReturned,
    bookedBy: a.bookedBy ?? null,
    canceledBy,
    canceledAt,
  }
}

export async function cancelMyAppointment({ env, fs, uid, data }: Ctx) {
  const id = String(data.appointmentId ?? '')
  if (!id || id.includes('/')) throw new ApiError('invalid-argument', 'Horário inválido.')
  const doc = await fs.get(`appointments/${id}`)
  const a = doc?.data
  if (!a || a.clientId !== uid) throw new ApiError('not-found', 'Horário não encontrado.')
  if (a.status !== 'scheduled' && a.status !== 'confirmed') {
    throw new ApiError('failed-precondition', 'Esse horário não pode mais ser desmarcado.')
  }
  const when = a.date as Date
  if (when.getTime() - Date.now() < CLIENT_CANCEL_MIN_HOURS * 60 * 60 * 1000) {
    throw new ApiError(
      'failed-precondition',
      `Só dá pra desmarcar pelo app até ${CLIENT_CANCEL_MIN_HOURS} h antes. Fale com a barbearia.`,
    )
  }

  const { creditReturned } = await cancelWithRefund(fs, id, { canceledBy: 'client' })
  await notify(env, fs, {
    type: 'appointment_canceled',
    targetRole: 'owner',
    relatedId: id,
    title: 'Horário desmarcado',
    message: `${a.clientName} desmarcou ${a.serviceName} de ${formatDateTimeBr(when)}.`,
  })
  return { ok: true, creditReturned }
}

/** Dono muda o status pela agenda (confirmar, concluir, faltou, cancelar). */
export async function setAppointmentStatus(ctx: Ctx) {
  const { env, fs, data, uid } = ctx
  const { isOwner } = await requireStaff(ctx)
  const id = String(data.appointmentId ?? '')
  if (!isOwner) {
    // colaborador só mexe nos horários dele
    const own = id && !id.includes('/') ? await fs.get(`appointments/${id}`) : null
    if (!own || own.data.barberId !== uid) throw new ApiError('permission-denied', 'Esse horário não é da sua agenda.')
  }
  const status = String(data.status ?? '')
  if (!id || id.includes('/')) throw new ApiError('invalid-argument', 'Horário inválido.')
  if (!['scheduled', 'confirmed', 'done', 'canceled', 'no_show'].includes(status)) {
    throw new ApiError('invalid-argument', 'Status inválido.')
  }

  if (status === 'canceled') {
    const { appt, creditReturned } = await cancelWithRefund(fs, id, { canceledBy: 'owner' })
    await notify(env, fs, {
      type: 'appointment_canceled',
      targetUserId: String(appt.clientId),
      relatedId: id,
      link: '/app/appointments',
      title: 'Horário cancelado pela barbearia',
      message:
        `Seu horário de ${appt.serviceName} em ${formatDateTimeBr(appt.date as Date)} foi cancelado.` +
        (creditReturned ? ' O crédito voltou para o seu plano.' : ''),
    })
    if (appt.clientPhone && (appt.date as Date).getTime() > Date.now()) {
      const { name } = await businessInfo(fs)
      await queueWhatsapp(fs, {
        phone: appt.clientPhone,
        kind: 'appointment_canceled',
        relatedId: id,
        text:
          `Olá, ${firstName(appt.clientName)}. Seu horário de *${appt.serviceName}* em ` +
          `${formatDateTimeBr(appt.date as Date)} foi *cancelado* pela barbearia.` +
          (creditReturned ? '\nO crédito voltou para o seu plano.' : '') +
          `\n\nPara marcar outro horário, é só responder aqui ou entrar no app.\n\n${name}`,
      })
    }
    return { ok: true, creditReturned }
  }

  const doc = await fs.get(`appointments/${id}`)
  if (!doc) throw new ApiError('not-found', 'Horário não encontrado.')
  if (doc.data.status === 'canceled') {
    throw new ApiError('failed-precondition', 'Horário cancelado não pode ser reaberto. Marque um novo.')
  }
  const update: Data = { status }
  if (status === 'done') {
    // Avulso: como pagou no balcão (o relatório desconta a taxa da maquininha em Pix/cartão).
    const method = String(data.paymentMethod ?? '')
    update.paymentMethod = ['dinheiro', 'pix', 'cartao'].includes(method) ? method : null
    update.autoCompleted = false
  }
  await fs.update(doc.path, update)
  return { ok: true, creditReturned: false }
}

// ---------- Sem cadastro (rotas sem login) ----------

/** Máximo de horários futuros marcados sem cadastro por telefone (evita trote). */
const GUEST_MAX_UPCOMING = 2

/** POST /api/publicServices — serviços ativos para a página "Agendar sem cadastro". */
export async function publicServices(fs: Firestore) {
  const docs = await fs.query('services', { where: [{ field: 'active', op: '==', value: true }] })
  const [{ name }, barbers] = await Promise.all([businessInfo(fs), listBarbers(fs)])
  return {
    businessName: name,
    barbers: barbers.map(({ id, name }) => ({ id, name })),
    services: docs
      .map((d) => ({
        id: d.id,
        name: String(d.data.name),
        durationMinutes: Number(d.data.durationMinutes),
        price: Number(d.data.price),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  }
}

/** POST /api/publicSlots { serviceIds, dateISO } — mesmos horários livres do app. */
export async function publicSlots(env: Ctx['env'], fs: Firestore, data: Data) {
  return getAvailableSlots({ env, fs, uid: '', data })
}

/** POST /api/guestBookAppointment { name, phone, serviceIds, dateISO } — avulso, sem conta. */
export async function guestBookAppointment(env: Ctx['env'], fs: Firestore, data: Data) {
  const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ').slice(0, 80) : ''
  if (name.length < 2) throw new ApiError('invalid-argument', 'Digite seu nome.')
  const phone = strictPhoneBr(data.phone)
  if (!phone) throw new ApiError('invalid-argument', PHONE_RULE)

  const mine = await fs.query('appointments', { where: [{ field: 'clientPhone', op: '==', value: phone }], limit: 30 })
  const upcoming = mine.filter(
    (d) => ['scheduled', 'confirmed'].includes(String(d.data.status)) && (d.data.date as Date).getTime() > Date.now(),
  )
  if (upcoming.length >= GUEST_MAX_UPCOMING) {
    throw new ApiError(
      'failed-precondition',
      `Esse telefone já tem ${upcoming.length} horários marcados. Para marcar mais, fale com a barbearia ou crie sua conta.`,
    )
  }

  const date = new Date(String(data.dateISO))
  const { appointmentId, appointment } = await createAppointment(fs, {
    clientId: null,
    clientName: name,
    clientPhone: phone,
    serviceIds: data.serviceIds,
    date,
    payMode: 'walk_in',
    bookedBy: 'guest',
    barberId: typeof data.barberId === 'string' ? data.barberId : null,
  })

  await notify(env, fs, {
    type: 'appointment_new',
    targetRole: 'owner',
    relatedId: appointmentId,
    title: 'Novo agendamento (sem cadastro)',
    message: `${name} (${phone}) agendou ${appointment.serviceName} em ${formatDateTimeBr(date)}.`,
  })
  await confirmByWhatsapp(fs, appointmentId, name, phone, appointment)
  await notifyBarber(env, fs, appointmentId, appointment)
  return { appointmentId, serviceName: appointment.serviceName, price: appointment.price, dateISO: date.toISOString() }
}
