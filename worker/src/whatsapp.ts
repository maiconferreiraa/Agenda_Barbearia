import type { Firestore } from './firestore'

/**
 * Fila de WhatsApp (`whatsappOutbox`): o servidor só grava; a ponte
 * (`ponte-whatsapp/`, num PC ligado) envia pelo número da barbearia.
 */
export function normalizePhoneBr(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let digits = raw.replace(/\D/g, '').replace(/^0+/, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return /^55\d{10,11}$/.test(digits) ? digits : null
}

export async function queueWhatsapp(
  fs: Firestore,
  input: { phone: unknown; text: string; kind: string; relatedId?: string },
): Promise<boolean> {
  const to = normalizePhoneBr(input.phone)
  if (!to) return false
  await fs.add('whatsappOutbox', {
    to,
    text: input.text,
    kind: input.kind,
    relatedId: input.relatedId ?? null,
    status: 'pending',
    attempts: 0,
    createdAt: new Date(),
  })
  return true
}

export async function businessInfo(fs: Firestore): Promise<{ name: string; phone: unknown }> {
  const doc = await fs.get('businessSettings/main')
  const name = typeof doc?.data.name === 'string' && doc.data.name.trim() ? doc.data.name.trim() : 'Barbearia Prime'
  return { name, phone: doc?.data.phone }
}

export function firstName(fullName: unknown): string {
  return typeof fullName === 'string' ? fullName.trim().split(/\s+/)[0] || '' : ''
}
