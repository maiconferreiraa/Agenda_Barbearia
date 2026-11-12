import type { Appointment, UserProfile } from '../types'

export interface BarberProduction {
  barberId: string
  name: string
  commissionPercent: number
  /** atendimentos concluídos */
  count: number
  /** avulsos cobrados no balcão */
  walkInTotal: number
  /** avulsos separados pela forma de pagamento (sem forma lançada = semForma) */
  byMethod: { pix: number; dinheiro: number; cartao: number; semForma: number }
  /** serviços feitos com crédito do plano (quantidade e valor de tabela) */
  planServices: number
  planValue: number
  /** produção = avulsos + valor de tabela dos serviços pelo plano */
  produced: number
  commission: number
  /** cada atendimento concluído do período (para o relatório individual) */
  details: ProductionDetail[]
}

export interface ProductionDetail {
  date: Date
  client: string
  service: string
  /** 'Pix' | 'Dinheiro' | 'Cartão' | 'Plano' | '—' */
  method: string
  /** valor que conta na produção (avulso cobrado + tabela do que foi pelo plano) */
  value: number
  commission: number
}

const METHOD_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }

/**
 * Produção por barbeiro no período (só horários Concluídos).
 * A comissão é a % do colaborador sobre tudo que ele produziu — inclusive os
 * serviços feitos pelo plano, pelo preço de tabela de cada serviço.
 * Horário sem barbeiro (antigo) conta para `fallbackId`.
 */
export function productionByBarber(
  appointments: Appointment[],
  barbers: Pick<UserProfile, 'uid' | 'name' | 'commissionPercent' | 'role'>[],
  start: Date,
  end: Date,
  fallbackId?: string,
): BarberProduction[] {
  const rows = new Map<string, BarberProduction>()
  for (const b of barbers) {
    rows.set(b.uid, {
      barberId: b.uid,
      name: b.name,
      commissionPercent: b.role === 'barber' ? Number(b.commissionPercent ?? 0) : 0,
      count: 0,
      walkInTotal: 0,
      byMethod: { pix: 0, dinheiro: 0, cartao: 0, semForma: 0 },
      planServices: 0,
      planValue: 0,
      produced: 0,
      commission: 0,
      details: [],
    })
  }
  for (const a of appointments) {
    if (a.status !== 'done') continue
    const when = a.date.toDate()
    if (when < start || when > end) continue
    const row = rows.get(a.barberId ?? fallbackId ?? '')
    if (!row) continue
    row.count++
    const lines = a.services?.length ? a.services : [{ price: a.price, usedPlanCredit: !!a.usedPlanCredit && a.price === 0, serviceName: a.serviceName }]
    let walkIn = 0
    let plan = 0
    for (const l of lines) {
      const price = Number(l.price) || 0
      if (l.usedPlanCredit) {
        row.planServices++
        plan += price
      } else walkIn += price
    }
    row.planValue += plan
    row.walkInTotal += walkIn
    const m = a.paymentMethod && a.paymentMethod in row.byMethod ? a.paymentMethod : 'semForma'
    row.byMethod[m as keyof BarberProduction['byMethod']] += walkIn
    const methods = [walkIn > 0 ? METHOD_LABEL[a.paymentMethod ?? ''] ?? '—' : '', plan > 0 ? 'Plano' : ''].filter(Boolean)
    row.details.push({
      date: when,
      client: a.clientName,
      service: a.serviceName,
      method: methods.join(' + ') || '—',
      value: walkIn + plan,
      commission: Math.round((walkIn + plan) * row.commissionPercent) / 100,
    })
  }
  for (const r of rows.values()) {
    r.produced = r.walkInTotal + r.planValue
    r.commission = Math.round(r.produced * r.commissionPercent) / 100
    r.details.sort((a, b) => a.date.getTime() - b.date.getTime())
  }
  return [...rows.values()]
}
