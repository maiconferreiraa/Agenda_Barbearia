import type { Appointment, Expense, Payment, CanceledAppointment } from '../types'

export type PeriodKind = 'week' | 'month' | 'year'

export interface Period {
  kind: PeriodKind
  start: Date
  end: Date
  label: string
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Período que contém `ref`, deslocado `offset` períodos (−1 = anterior). Semana de segunda a domingo. */
export function periodFor(kind: PeriodKind, ref: Date, offset = 0): Period {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  let start: Date
  let end: Date
  if (kind === 'week') {
    const mondayShift = (d.getDay() + 6) % 7
    start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayShift + offset * 7)
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
  } else if (kind === 'month') {
    start = new Date(d.getFullYear(), d.getMonth() + offset, 1)
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
  } else {
    start = new Date(d.getFullYear() + offset, 0, 1)
    end = new Date(start.getFullYear() + 1, 0, 1)
  }
  end = new Date(end.getTime() - 1)

  const label =
    kind === 'week'
      ? `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`
      : kind === 'month'
        ? `${MONTHS[start.getMonth()]} de ${start.getFullYear()}`
        : String(start.getFullYear())
  return { kind, start, end, label }
}

export interface Bucket {
  key: string
  label: string
  /** Rótulo completo para o tooltip. */
  fullLabel: string
  plans: number
  walkIn: number
}

function bucketKey(kind: PeriodKind, date: Date) {
  return kind === 'year' ? `${date.getMonth()}` : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function emptyBuckets(p: Period): Bucket[] {
  if (p.kind === 'year') {
    return MONTHS.map((m, i) => ({
      key: String(i),
      label: m,
      fullLabel: `${m} de ${p.start.getFullYear()}`,
      plans: 0,
      walkIn: 0,
    }))
  }
  const out: Bucket[] = []
  for (let d = new Date(p.start); d <= p.end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    out.push({
      key: bucketKey(p.kind, d),
      label: p.kind === 'week' ? `${WEEKDAYS[d.getDay()]} ${d.getDate()}` : String(d.getDate()),
      fullLabel: `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`,
      plans: 0,
      walkIn: 0,
    })
  }
  return out
}

export interface Row {
  name: string
  count: number
  total: number
}

/** Linha detalhada para exportar (PDF/CSV). */
export interface DetailRow {
  date: Date
  client: string
  item: string
  method: string
  amount: number
}

export interface FinanceReport {
  buckets: Bucket[]
  plansTotal: number
  plansCount: number
  walkInTotal: number
  walkInCount: number
  /** Serviços atendidos usando crédito do plano (não somam receita: já pagos na mensalidade). */
  creditUses: number
  byPlan: Row[]
  byService: Row[]
  creditByService: Row[]
  /** Atendimentos que já passaram e não foram marcados como concluídos. */
  notClosed: number
  paymentDetails: DetailRow[]
  walkInDetails: DetailRow[]
  expensesTotal: number
  byCategory: Row[]
  /** Cada ocorrência de saída no período (as fixas aparecem uma vez por mês). */
  expenseDetails: (DetailRow & { expenseId: string; recurring: boolean })[]
  /** Taxas da InfinitePay estimadas nos pagamentos de mensalidade (Pix/cartão). */
  feesTotal: number
  /** Horários cancelados no período (só informativo, não mexe nos totais). */
  canceledCount: number
  /** Valor avulso que deixou de entrar por causa dos cancelamentos. */
  canceledValue: number
  canceledDetails: (DetailRow & { canceledBy: string })[]
}

/** Datas em que a saída cai dentro do período (fixa = todo mês no mesmo dia, desde a data inicial). */
export function expenseOccurrences(e: Expense, p: Period): Date[] {
  const first = e.date.toDate()
  if (!e.recurring) return first >= p.start && first <= p.end ? [first] : []
  const ended = e.endedAt?.toDate?.()
  const out: Date[] = []
  const cursor = new Date(Math.max(first.getTime(), p.start.getTime()))
  for (let y = cursor.getFullYear(), m = cursor.getMonth(); new Date(y, m, 1) <= p.end; m++) {
    const lastDay = new Date(y, m + 1, 0).getDate()
    const occ = new Date(y, m, Math.min(first.getDate(), lastDay), 12)
    if (occ >= first && occ >= p.start && occ <= p.end && (!ended || occ <= ended)) out.push(occ)
    if (m === 11) {
      m = -1
      y++
    }
  }
  return out
}

function addRow(map: Map<string, Row>, name: string, value: number) {
  const r = map.get(name) ?? { name, count: 0, total: 0 }
  r.count++
  r.total += value
  map.set(name, r)
}

const byTotal = (a: Row, b: Row) => b.total - a.total || b.count - a.count

function planNameOf(p: Payment) {
  if (p.planName) return p.planName
  return (p.description ?? 'Plano').replace(/^(Mensalidade|Assinatura)\s+/i, '')
}

/**
 * Receita do período:
 * - Planos = pagamentos aprovados (mensalidades e upgrades) pela data do pagamento.
 * - Avulsos = parte paga no balcão dos atendimentos CONCLUÍDOS, pela data do atendimento.
 */
export function buildReport(
  p: Period,
  payments: Payment[],
  appointments: Appointment[],
  expenses: Expense[] = [],
  canceled: CanceledAppointment[] = [],
  fees: { pix?: number; card?: number } = {},
): FinanceReport {
  let feesTotal = 0
  const buckets = emptyBuckets(p)
  const index = new Map(buckets.map((b) => [b.key, b]))
  const plans = new Map<string, Row>()
  const services = new Map<string, Row>()
  const credits = new Map<string, Row>()
  let plansTotal = 0
  let plansCount = 0
  let walkInTotal = 0
  let walkInCount = 0
  let creditUses = 0
  let notClosed = 0
  const now = Date.now()
  const paymentDetails: DetailRow[] = []
  const walkInDetails: DetailRow[] = []
  const METHOD: Record<string, string> = { pix: 'Pix', credit_card: 'Cartão' }

  for (const pay of payments) {
    if (pay.status !== 'approved' || !pay.paidAt) continue
    const when = pay.paidAt.toDate()
    const amount = Number(pay.amount) || 0
    plansTotal += amount
    plansCount++
    // A API não informa a taxa: usa a % que o dono cadastrou para Pix ou cartão.
    // Taxa repassada ao cliente: a barbearia já recebe o valor cheio, sem desconto.
    const rate = pay.feePassedToClient ? 0 : pay.captureMethod === 'pix' ? fees.pix : fees.card
    if (rate && rate > 0) feesTotal += Math.round(amount * rate) / 100
    addRow(plans, planNameOf(pay), amount)
    paymentDetails.push({
      date: when,
      client: pay.clientName,
      item: pay.kind === 'upgrade' ? `Upgrade → ${planNameOf(pay)}` : planNameOf(pay),
      method: METHOD[pay.captureMethod ?? ''] ?? 'InfinitePay',
      amount,
    })
    const b = index.get(bucketKey(p.kind, when))
    if (b) b.plans += amount
  }

  for (const a of appointments) {
    const when = a.date.toDate()
    if (a.status === 'scheduled' || a.status === 'confirmed') {
      if (when.getTime() < now) notClosed++
      continue
    }
    if (a.status !== 'done') continue

    const lines = a.services?.length
      ? a.services
      : [{ serviceName: a.serviceName, price: a.price, usedPlanCredit: !!a.usedPlanCredit && a.price === 0 }]
    let paidHere = 0
    for (const line of lines) {
      if (line.usedPlanCredit) {
        creditUses++
        addRow(credits, line.serviceName, 0)
      } else {
        paidHere += Number(line.price) || 0
        addRow(services, line.serviceName, Number(line.price) || 0)
      }
    }
    if (paidHere > 0) {
      walkInDetails.push({
        date: when,
        client: a.clientName,
        item: lines.filter((l) => !l.usedPlanCredit).map((l) => l.serviceName).join(' + '),
        method: 'Balcão',
        amount: paidHere,
      })
      walkInTotal += paidHere
      walkInCount++
      const b = index.get(bucketKey(p.kind, when))
      if (b) b.walkIn += paidHere
    }
  }

  const categories = new Map<string, Row>()
  const expenseDetails: FinanceReport['expenseDetails'] = []
  let expensesTotal = 0
  for (const e of expenses) {
    for (const when of expenseOccurrences(e, p)) {
      const amount = Number(e.amount) || 0
      expensesTotal += amount
      addRow(categories, e.category || 'Outros', amount)
      expenseDetails.push({
        date: when,
        client: '',
        item: e.description,
        method: e.category || 'Outros',
        amount,
        expenseId: e.id,
        recurring: !!e.recurring,
      })
    }
  }
  expenseDetails.sort((a, b) => a.date.getTime() - b.date.getTime())

  const canceledDetails = canceled
    .map((c) => ({
      date: c.date.toDate(),
      client: c.clientName,
      item: c.serviceName,
      method: c.usedPlanCredit ? 'Plano' : 'Avulso',
      amount: c.usedPlanCredit ? 0 : Number(c.price) || 0,
      canceledBy: c.canceledBy === 'owner' ? 'Barbearia' : 'Cliente',
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  return {
    feesTotal: Math.round(feesTotal * 100) / 100,
    canceledCount: canceledDetails.length,
    canceledValue: canceledDetails.reduce((s, c) => s + c.amount, 0),
    canceledDetails,
    expensesTotal,
    byCategory: [...categories.values()].sort(byTotal),
    expenseDetails,
    buckets,
    plansTotal,
    plansCount,
    walkInTotal,
    walkInCount,
    creditUses,
    byPlan: [...plans.values()].sort(byTotal),
    byService: [...services.values()].sort(byTotal),
    creditByService: [...credits.values()].sort((a, b) => b.count - a.count),
    notClosed,
    paymentDetails,
    walkInDetails,
  }
}
