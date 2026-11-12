import { ApiError, HTTP_STATUS, type Env } from './env'
import { Firestore } from './firestore'
import { budget } from './google'
import { requireUid } from './auth'
import type { Ctx } from './api/ctx'
import { claimOwnerRole } from './api/account'
import {
  bookAppointment,
  cancelMyAppointment,
  getAvailableSlots,
  guestBookAppointment,
  ownerBookAppointment,
  publicServices,
  publicSlots,
  setAppointmentStatus,
} from './api/booking'
import {
  cancelMyPlan,
  cancelSubscription,
  upgradePlan,
  confirmInvoicePayment,
  connectInfinitePay,
  subscribePlan,
} from './api/plans'
import { infinitePayWebhook } from './api/webhook'
import { importSubscription, updateClientPhone } from './api/importSubscription'
import { confirmCardPayment, markCardRefused } from './api/cardRecurring'
import { claimUsername, loginWithUsername, usernameAvailable } from './api/username'
import { runBilling } from './scheduled'
import { runAppointmentReminders } from './reminders'
import { runHolidayNotices } from './holidays'
import { runAutoComplete } from './autoComplete'
import { runMarketing } from './marketing'
import { confirmLinkCode, requestLinkCode } from './api/linkAccount'

/** Endpoints chamados pelo app: POST /api/<nome>, com o token de login. */
const ROUTES: Record<string, (ctx: Ctx) => Promise<unknown>> = {
  claimOwnerRole,
  getAvailableSlots,
  bookAppointment,
  ownerBookAppointment,
  cancelMyAppointment,
  setAppointmentStatus,
  subscribePlan,
  confirmInvoicePayment,
  connectInfinitePay,
  cancelSubscription,
  cancelMyPlan,
  upgradePlan,
  claimUsername,
  importSubscription,
  updateClientPhone,
  confirmCardPayment,
  markCardRefused,
  // em espera (LINK_ACCOUNT_ENABLED = false responde "não encontrada")
  requestLinkCode,
  confirmLinkCode,
}

const PUBLIC_ROUTES: Record<string, (env: Env, fs: Firestore, data: Record<string, unknown>) => Promise<unknown>> = {
  usernameAvailable: (_env, fs, data) => usernameAvailable(fs, data),
  loginWithUsername,
  publicServices: (_env, fs) => publicServices(fs),
  publicSlots,
  guestBookAppointment,
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

async function handleApi(request: Request, env: Env, name: string): Promise<Response> {
  budget.used = 0
  if (name === 'infinitepay-webhook') return infinitePayWebhook(request, env)

  // Rotas sem login: usuário livre?, entrar com usuário e agendar sem cadastro.
  const open = PUBLIC_ROUTES[name]
  if (open) {
    if (request.method !== 'POST') return json({ error: { code: 'invalid-argument', message: 'Use POST.' } }, 405)
    try {
      const data = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
      const result = await open(env, new Firestore(env), data)
      return json({ result })
    } catch (err) {
      if (err instanceof ApiError) return json({ error: { code: err.code, message: err.message } }, HTTP_STATUS[err.code])
      console.error(`Erro em /api/${name}`, String(err))
      return json({ error: { code: 'internal', message: 'Erro interno. Tente de novo em instantes.' } }, 500)
    }
  }

  const handler = ROUTES[name]
  if (!handler) return json({ error: { code: 'not-found', message: 'Rota não encontrada.' } }, 404)
  if (request.method !== 'POST') return json({ error: { code: 'invalid-argument', message: 'Use POST.' } }, 405)

  try {
    const uid = await requireUid(request, env)
    const data = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const result = await handler({ env, fs: new Firestore(env), uid, data: data ?? {} })
    return json({ result })
  } catch (err) {
    if (err instanceof ApiError) return json({ error: { code: err.code, message: err.message } }, HTTP_STATUS[err.code])
    console.error(`Erro em /api/${name}`, String(err))
    return json({ error: { code: 'internal', message: 'Erro interno. Tente de novo em instantes.' } }, 500)
  }
}

/** Só para testar o app rodando no PC (localhost) contra o servidor publicado. */
function withLocalCors(request: Request, response: Response): Response {
  const origin = request.headers.get('Origin') ?? ''
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return response
  const res = new Response(response.body, response)
  res.headers.set('Access-Control-Allow-Origin', origin)
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set('Vary', 'Origin')
  return res
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') return withLocalCors(request, new Response(null, { status: 204 }))
      return withLocalCors(request, await handleApi(request, env, url.pathname.slice(5)))
    }
    return env.ASSETS.fetch(request)
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Cobrança primeiro; o lembrete de horário usa o que sobrar do limite de chamadas.
    ctx.waitUntil(
      runBilling(env)
        .catch((err) => console.error('Régua de cobrança falhou', String(err)))
        .then(() => runAppointmentReminders(env))
        .catch((err) => console.error('Lembretes de horário falharam', String(err)))
        .then(() => runHolidayNotices(env))
        .catch((err) => console.error('Avisos de feriado falharam', String(err)))
        .then(() => runAutoComplete(env))
        .catch((err) => console.error('Concluir sozinho falhou', String(err)))
        .then(() => runMarketing(env))
        .catch((err) => console.error('Marketing falhou', String(err))),
    )
  },
} satisfies ExportedHandler<Env>
