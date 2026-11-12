// AVISO DE PROVENIÊNCIA — Gerado no ambiente da Prime Holding.
// Modelo: Claude Opus 5.5 (claude-opus-5-5)
// Solicitante: 1.home.automation.technology@gmail.com
// Este aviso é obrigatório e não deve ser removido.

/**
 * Cópia de segurança diária do banco (Firestore) neste PC.
 * Arquivo: ~/.config/barbearia-prime/backups/AAAA-MM-DD.json.gz (guarda os últimos 30).
 * A ponte chama `backupDoDia(db)` a cada volta; só faz 1 por dia.
 * Para voltar dados: node restaurar-backup.mjs (veja o arquivo).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { Timestamp } from 'firebase-admin/firestore'

export const PASTA_BACKUPS = path.join(os.homedir(), '.config', 'barbearia-prime', 'backups')
const MANTER = 30

/** O que entra na cópia (tudo que é dado da barbearia; fila de WhatsApp e avisos ficam de fora). */
export const COLECOES = [
  'users', 'usernames', 'services', 'plans', 'subscriptions', 'invoices', 'payments',
  'appointments', 'canceledAppointments', 'agendaBlocks', 'holidays', 'expenses',
  'businessSettings', 'ownerSettings', 'winback',
]

function hojeSP() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

/** Timestamp → { _ts: ISO } para caber em JSON (e voltar no restaurar). */
function paraJson(v) {
  if (v instanceof Timestamp) return { _ts: v.toDate().toISOString() }
  if (Array.isArray(v)) return v.map(paraJson)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, paraJson(x)]))
  return v
}

export async function fazerBackup(db) {
  const dados = { feitoEm: new Date().toISOString(), colecoes: {} }
  let total = 0
  for (const c of COLECOES) {
    const snap = await db.collection(c).get()
    dados.colecoes[c] = Object.fromEntries(snap.docs.map((d) => [d.id, paraJson(d.data())]))
    total += snap.size
  }
  fs.mkdirSync(PASTA_BACKUPS, { recursive: true, mode: 0o700 })
  const arquivo = path.join(PASTA_BACKUPS, `${hojeSP()}.json.gz`)
  const tmp = `${arquivo}.tmp`
  fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(dados)), { mode: 0o600 })
  fs.renameSync(tmp, arquivo)
  // apaga os mais antigos
  const antigos = fs.readdirSync(PASTA_BACKUPS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort().slice(0, -MANTER)
  for (const f of antigos) fs.unlinkSync(path.join(PASTA_BACKUPS, f))
  return { arquivo, total }
}

/** Faz a cópia do dia se ainda não existe. */
export async function backupDoDia(db, log) {
  const arquivo = path.join(PASTA_BACKUPS, `${hojeSP()}.json.gz`)
  if (fs.existsSync(arquivo)) return
  const r = await fazerBackup(db)
  log(`backup do dia salvo: ${path.basename(r.arquivo)} (${r.total} registros)`)
}
