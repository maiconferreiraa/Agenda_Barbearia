import { logger } from 'firebase-functions/v2'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './admin'

/**
 * Fila de WhatsApp (`whatsappOutbox`).
 *
 * As Cloud Functions não alcançam o robô de WhatsApp (ele roda no PC do dono),
 * então só gravam a mensagem aqui. A ponte local (`ponte-whatsapp/`) lê a fila
 * e pede o envio ao robô, com pausa entre mensagens.
 */

/** Deixa o telefone no formato 55DDDNÚMERO; devolve null se não parecer celular BR. */
export function normalizePhoneBr(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let digits = raw.replace(/\D/g, '').replace(/^0+/, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  if (!/^55\d{10,11}$/.test(digits)) return null
  return digits
}

interface QueueInput {
  /** Telefone livre (como foi digitado) — é normalizado aqui. */
  phone: unknown
  text: string
  /** Para rastrear de onde veio (ex.: invoice_created, payment_overdue). */
  kind: string
  relatedId?: string
}

export async function queueWhatsapp(input: QueueInput): Promise<boolean> {
  const to = normalizePhoneBr(input.phone)
  if (!to) {
    logger.info('WhatsApp não enfileirado: telefone ausente ou inválido', {
      kind: input.kind,
      relatedId: input.relatedId,
    })
    return false
  }
  await db.collection('whatsappOutbox').add({
    to,
    text: input.text,
    kind: input.kind,
    relatedId: input.relatedId ?? null,
    status: 'pending',
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
  })
  return true
}

/** Telefone do cliente (cadastro em users/{uid}.phone). */
export async function clientPhone(clientId: string): Promise<unknown> {
  const snap = await db.collection('users').doc(clientId).get()
  return snap.data()?.phone
}

/** Nome e telefone da barbearia (Configurações, businessSettings/main). */
export async function businessInfo(): Promise<{ name: string; phone: unknown }> {
  const snap = await db.collection('businessSettings').doc('main').get()
  const data = snap.data() ?? {}
  return {
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Barbearia Prime',
    phone: data.phone,
  }
}

/** Primeiro nome, para a saudação. */
export function firstName(fullName: unknown): string {
  return typeof fullName === 'string' ? fullName.trim().split(/\s+/)[0] || '' : ''
}
