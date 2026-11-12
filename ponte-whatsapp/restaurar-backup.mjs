// AVISO DE PROVENIÊNCIA — Gerado no ambiente da Prime Holding.
// Modelo: Claude Opus 5.5 (claude-opus-5-5)
// Solicitante: 1.home.automation.technology@gmail.com
// Este aviso é obrigatório e não deve ser removido.

/**
 * Volta dados de uma cópia de segurança (backup.mjs) para o Firestore.
 *
 *   node restaurar-backup.mjs                          → lista as cópias
 *   node restaurar-backup.mjs 2026-11-12               → mostra o que tem na cópia
 *   node restaurar-backup.mjs 2026-11-12 --colecao appointments [--id XYZ]
 *        → SIMULA: mostra o que voltaria (só o que está faltando hoje)
 *   ... --aplicar           → grava de verdade (só documentos que sumiram)
 *   ... --aplicar --sobrescrever → também troca os que existem pelo da cópia
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { PASTA_BACKUPS } from './backup.mjs'

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const dia = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))

if (!dia) {
  const lista = fs.existsSync(PASTA_BACKUPS) ? fs.readdirSync(PASTA_BACKUPS).filter((f) => f.endsWith('.json.gz')).sort() : []
  console.log('Cópias disponíveis:\n' + (lista.map((f) => '  ' + f.replace('.json.gz', '')).join('\n') || '  (nenhuma)'))
  process.exit(0)
}
const dados = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PASTA_BACKUPS, `${dia}.json.gz`))))
const colecao = opt('--colecao')
if (!colecao) {
  console.log(`Cópia de ${dia} (feita em ${dados.feitoEm}):`)
  for (const [c, docs] of Object.entries(dados.colecoes)) console.log(`  ${c}: ${Object.keys(docs).length}`)
  process.exit(0)
}

const voltar = (v) => {
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && v._ts) return Timestamp.fromDate(new Date(v._ts))
  if (Array.isArray(v)) return v.map(voltar)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, voltar(x)]))
  return v
}
const cfg = JSON.parse(fs.readFileSync(path.join(path.dirname(PASTA_BACKUPS), 'ponte.json'), 'utf-8'))
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(cfg.credenciais, 'utf-8'))) })
const db = getFirestore()
const aplicar = args.includes('--aplicar')
const sobrescrever = args.includes('--sobrescrever')
const id = opt('--id')
const docs = Object.entries(dados.colecoes[colecao] ?? {}).filter(([k]) => !id || k === id)
let n = 0
for (const [docId, valor] of docs) {
  const ref = db.collection(colecao).doc(docId)
  const existe = (await ref.get()).exists
  if (existe && !sobrescrever) continue
  console.log(`${aplicar ? 'voltando' : 'voltaria'}: ${colecao}/${docId}${existe ? ' (sobrescreve)' : ''}`)
  if (aplicar) await ref.set(voltar(valor))
  n++
}
console.log(aplicar ? `${n} documento(s) restaurado(s).` : `${n} documento(s). Nada foi gravado — use --aplicar.`)
process.exit(0)
