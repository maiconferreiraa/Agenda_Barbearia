import type { Timestamp } from 'firebase/firestore'

export function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(value?: Timestamp | Date | null) {
  if (!value) return '—'
  const date = value instanceof Date ? value : value.toDate()
  return date.toLocaleDateString('pt-BR')
}

export function formatDateTime(value?: Timestamp | Date | null) {
  if (!value) return '—'
  const date = value instanceof Date ? value : value.toDate()
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(value?: Timestamp | Date | null) {
  if (!value) return '—'
  const date = value instanceof Date ? value : value.toDate()
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function daysUntil(value?: Timestamp | Date | null) {
  if (!value) return null
  const date = value instanceof Date ? value : value.toDate()
  const diffMs = date.getTime() - Date.now()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
