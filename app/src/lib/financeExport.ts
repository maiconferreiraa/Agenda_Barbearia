import type { FinanceReport, Period } from './finance'
import logoUrl from '../assets/logo.jpg'

/** Carrega a logo como data URL para o jsPDF. */
async function loadImage(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/** Nome de arquivo: relatorio-financeiro-2026-11.csv / -2026.pdf / -semana-2026-11-10.pdf */
function fileBase(p: Period) {
  const y = p.start.getFullYear()
  const m = String(p.start.getMonth() + 1).padStart(2, '0')
  const d = String(p.start.getDate()).padStart(2, '0')
  const tag = p.kind === 'year' ? `${y}` : p.kind === 'month' ? `${y}-${m}` : `semana-${y}-${m}-${d}`
  return `relatorio-financeiro-${tag}`
}

const money = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl = (v: number) => `R$ ${money(v)}`
const dateBr = (d: Date) => d.toLocaleDateString('pt-BR')

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------- CSV (Excel pt-BR: ";" e vírgula decimal) ----------

function csvCell(v: string | number) {
  const s = typeof v === 'number' ? money(v) : v
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportCsv(shop: string, p: Period, r: FinanceReport) {
  const lines: (string | number)[][] = []
  const total = r.plansTotal + r.walkInTotal
  lines.push([`Relatório financeiro - ${shop}`], [`Período: ${p.label}`], [])
  lines.push(['RESUMO'], ['Entradas', total], ['Saídas', r.expensesTotal], [total - r.expensesTotal < 0 ? 'Prejuízo' : 'Lucro', total - r.expensesTotal])
  lines.push(['Mensalidades', r.plansTotal], ['Avulsos (balcão)', r.walkInTotal])
  lines.push(['Pagamentos de mensalidade', r.plansCount], ['Atendimentos avulsos', r.walkInCount], ['Serviços pelo plano', r.creditUses], [])

  lines.push(['RECEITA POR ' + (p.kind === 'year' ? 'MÊS' : 'DIA')], ['Data', 'Mensalidades', 'Avulsos', 'Total'])
  for (const b of r.buckets) lines.push([b.fullLabel, b.plans, b.walkIn, b.plans + b.walkIn])
  lines.push([])

  lines.push(['MENSALIDADES POR PLANO'], ['Plano', 'Pagamentos', 'Total'])
  for (const x of r.byPlan) lines.push([x.name, String(x.count), x.total])
  lines.push([])
  lines.push(['AVULSOS POR SERVIÇO'], ['Serviço', 'Quantidade', 'Total'])
  for (const x of r.byService) lines.push([x.name, String(x.count), x.total])
  lines.push([])
  lines.push(['SERVIÇOS FEITOS PELO PLANO'], ['Serviço', 'Vezes'])
  for (const x of r.creditByService) lines.push([x.name, String(x.count)])
  lines.push([])

  lines.push(['PAGAMENTOS DE MENSALIDADE (DETALHADO)'], ['Data', 'Cliente', 'Plano', 'Forma', 'Valor'])
  for (const d of r.paymentDetails) lines.push([dateBr(d.date), d.client, d.item, d.method, d.amount])
  lines.push([])
  lines.push(['AVULSOS (DETALHADO)'], ['Data', 'Cliente', 'Serviço', 'Forma', 'Valor'])
  for (const d of r.walkInDetails) lines.push([dateBr(d.date), d.client, d.item, d.method, d.amount])
  lines.push([])
  lines.push(['SAÍDAS POR TIPO'], ['Tipo', 'Lançamentos', 'Total'])
  for (const x of r.byCategory) lines.push([x.name, String(x.count), x.total])
  lines.push([])
  lines.push(['SAÍDAS (DETALHADO)'], ['Data', 'Descrição', 'Tipo', 'Fixa', 'Valor'])
  for (const d of r.expenseDetails) lines.push([dateBr(d.date), d.item, d.method, d.recurring ? 'sim' : 'não', d.amount])
  lines.push([])
  lines.push(['CANCELAMENTOS'], ['Data', 'Cliente', 'Serviço', 'Cancelou', 'Tipo', 'Valor'])
  for (const d of r.canceledDetails) lines.push([dateBr(d.date), d.client, d.item, d.canceledBy, d.method, d.amount])

  const csv = lines.map((l) => l.map(csvCell).join(';')).join('\r\n')
  // BOM: faz o Excel reconhecer acentos (UTF-8)
  download(`${fileBase(p)}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
}

// ---------- PDF ----------

export async function exportPdf(shop: string, p: Period, r: FinanceReport) {
  // Carrega a biblioteca só quando o dono pede o PDF (não pesa o app).
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const left = 40
  const total = r.plansTotal + r.walkInTotal
  const head = { fillColor: [26, 26, 29] as [number, number, number], textColor: 255 }
  const money = { halign: 'right' as const }
  let y = 48

  // Logo da barbearia no topo (720×344 → 150×72 pt)
  try {
    const logo = await loadImage(logoUrl)
    doc.addImage(logo, 'JPEG', left, 28, 150, 72)
    y = 124
  } catch {
    /* sem logo: segue só com o título */
  }

  doc.setFontSize(16)
  doc.text(`Relatório financeiro — ${shop}`, left, y)
  doc.setFontSize(10)
  doc.setTextColor(110)
  y += 16
  doc.text(`Período: ${p.label} · gerado em ${new Date().toLocaleString('pt-BR')}`, left, y)
  doc.setTextColor(0)

  const next = () => ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? y) + 22
  const section = (title: string, at: number) => {
    doc.setFontSize(11)
    doc.text(title, left, at)
    return at + 6
  }

  autoTable(doc, {
    startY: y + 14,
    theme: 'grid',
    headStyles: head,
    head: [['Resumo', 'Valor']],
    body: [
      ['Entradas', brl(total)],
      ['Saídas', brl(r.expensesTotal)],
      [total - r.expensesTotal < 0 ? 'Prejuízo' : 'Lucro', brl(total - r.expensesTotal)],
      [`Mensalidades (${r.plansCount} pagamento(s))`, brl(r.plansTotal)],
      [`Avulsos no balcão (${r.walkInCount} atendimento(s))`, brl(r.walkInTotal)],
      ['Serviços feitos pelo plano', String(r.creditUses)],
      ['Horários cancelados', String(r.canceledCount)],
    ],
    columnStyles: { 1: money },
  })

  const table = (title: string, header: string[], body: string[][], rightCols: number[]) => {
    if (body.length === 0) return
    let at = next()
    if (at > 760) {
      doc.addPage()
      at = 48
    }
    autoTable(doc, {
      startY: section(title, at),
      theme: 'striped',
      headStyles: head,
      head: [header],
      body,
      columnStyles: Object.fromEntries(rightCols.map((c) => [c, money])),
    })
  }

  table(
    `Receita por ${p.kind === 'year' ? 'mês' : 'dia'}`,
    ['Data', 'Mensalidades', 'Avulsos', 'Total'],
    r.buckets.filter((b) => b.plans + b.walkIn > 0).map((b) => [b.fullLabel, brl(b.plans), brl(b.walkIn), brl(b.plans + b.walkIn)]),
    [1, 2, 3],
  )
  table('Mensalidades por plano', ['Plano', 'Pagamentos', 'Total'], r.byPlan.map((x) => [x.name, String(x.count), brl(x.total)]), [1, 2])
  table('Avulsos por serviço', ['Serviço', 'Quantidade', 'Total'], r.byService.map((x) => [x.name, String(x.count), brl(x.total)]), [1, 2])
  table('Serviços feitos pelo plano', ['Serviço', 'Vezes'], r.creditByService.map((x) => [x.name, String(x.count)]), [1])
  table(
    'Pagamentos de mensalidade (detalhado)',
    ['Data', 'Cliente', 'Plano', 'Forma', 'Valor'],
    r.paymentDetails.map((d) => [dateBr(d.date), d.client, d.item, d.method, brl(d.amount)]),
    [4],
  )
  table(
    'Avulsos (detalhado)',
    ['Data', 'Cliente', 'Serviço', 'Forma', 'Valor'],
    r.walkInDetails.map((d) => [dateBr(d.date), d.client, d.item, d.method, brl(d.amount)]),
    [4],
  )

  table('Saídas por tipo', ['Tipo', 'Lançamentos', 'Total'], r.byCategory.map((x) => [x.name, String(x.count), brl(x.total)]), [1, 2])
  table(
    'Saídas (detalhado)',
    ['Data', 'Descrição', 'Tipo', 'Fixa', 'Valor'],
    r.expenseDetails.map((d) => [dateBr(d.date), d.item, d.method, d.recurring ? 'sim' : 'não', brl(d.amount)]),
    [4],
  )

  table(
    'Cancelamentos',
    ['Data', 'Cliente', 'Serviço', 'Cancelou', 'Valor'],
    r.canceledDetails.map((d) => [dateBr(d.date), d.client, d.item, d.canceledBy, d.method === 'Plano' ? 'plano' : brl(d.amount)]),
    [4],
  )

  doc.save(`${fileBase(p)}.pdf`)
}
