// AVISO DE PROVENIÊNCIA — Gerado no ambiente da Prime Holding.
// Modelo: Claude Opus 5.5 (claude-opus-5-5)
// Solicitante: 1.home.automation.technology@gmail.com
// Este aviso é obrigatório e não deve ser removido.

/**
 * Ponte WhatsApp da Barbearia Prime.
 *
 * As Cloud Functions gravam as mensagens de cobrança em `whatsappOutbox`
 * (Firestore). Esta ponte roda no PC onde está o robô de WhatsApp: lê a fila,
 * pede o envio ao robô (POST /api/barbearia/whatsapp, com token) e marca cada
 * mensagem como enviada ou com falha.
 *
 * Configuração em ~/.config/barbearia-prime/ponte.json (fora do repositório):
 *   {
 *     "credenciais": "/caminho/service-account.json",  // chave da conta de serviço do Firebase
 *     "roboUrl": "http://127.0.0.1:4545/api/barbearia/whatsapp",
 *     "token": "mesmo token de robo_ml_afiliados/data/barbearia-ponte.json"
 *   }
 *
 * Uso: node ponte.mjs            (fica rodando)
 *      node ponte.mjs --uma-vez  (processa a fila uma vez e sai)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const CONFIG_PATH = path.join(os.homedir(), '.config', 'barbearia-prime', 'ponte.json')

const INTERVALO_MS = 60_000 // olha a fila a cada 1 min
const PAUSA_ENTRE_ENVIOS_MS = 20_000 // evita rajada (WhatsApp bloqueia número que dispara rápido)
const MAX_TENTATIVAS = 3
const VALIDADE_MS = 48 * 60 * 60 * 1000 // mensagem velha (PC desligado) não sai mais
const HORA_INICIO = 8 // só envia entre 8h e 21h (horário de Brasília)
const HORA_FIM = 21

function log(...args) {
  console.log(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), '[ponte]', ...args)
}

function lerConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config não encontrada: ${CONFIG_PATH} (veja o README da ponte)`)
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
  for (const campo of ['credenciais', 'roboUrl', 'token']) {
    if (!cfg[campo]) throw new Error(`Campo "${campo}" faltando em ${CONFIG_PATH}`)
  }
  return cfg
}

function horaSaoPaulo() {
  return Number(
    new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()),
  )
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const cfg = lerConfig()
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(cfg.credenciais, 'utf-8'))) })
const db = getFirestore()

/** Envia pelo robô. Devolve 'ok' | 'robo_fora' | mensagem de erro. */
async function enviarPeloRobo(numero, texto) {
  let res
  try {
    res = await fetch(cfg.roboUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ponte-token': cfg.token },
      body: JSON.stringify({ numero, texto }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return 'robo_fora'
  }
  if (res.ok) return 'ok'
  const corpo = await res.text().catch(() => '')
  if (res.status === 429 || res.status === 503) return 'robo_fora' // limite do dia / desligado: tenta depois
  return `HTTP ${res.status} ${corpo.slice(0, 200)}`
}

async function processarFila() {
  const hora = horaSaoPaulo()
  if (hora < HORA_INICIO || hora >= HORA_FIM) return

  const snap = await db.collection('whatsappOutbox').where('status', '==', 'pending').limit(20).get()
  if (snap.empty) return

  const docs = snap.docs.sort(
    (a, b) => (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0),
  )

  let enviados = 0
  for (const doc of docs) {
    const msg = doc.data()
    const criada = msg.createdAt?.toMillis?.() ?? Date.now()
    if (Date.now() - criada > VALIDADE_MS) {
      await doc.ref.update({ status: 'expired' })
      log('expirada (mais de 48 h na fila):', doc.id, msg.kind)
      continue
    }

    if (enviados > 0) await dormir(PAUSA_ENTRE_ENVIOS_MS)
    const resultado = await enviarPeloRobo(msg.to, msg.text)

    if (resultado === 'ok') {
      await doc.ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp() })
      enviados++
      log('enviada:', doc.id, msg.kind, '→', msg.to.slice(0, 6) + '…')
      continue
    }
    if (resultado === 'robo_fora') {
      log('robô indisponível ou no limite do dia — tento de novo no próximo ciclo')
      return
    }

    const tentativas = (msg.attempts ?? 0) + 1
    await doc.ref.update({
      attempts: tentativas,
      lastError: resultado,
      ...(tentativas >= MAX_TENTATIVAS ? { status: 'failed' } : {}),
    })
    log(`falha (${tentativas}/${MAX_TENTATIVAS}):`, doc.id, resultado)
  }
}

async function main() {
  const umaVez = process.argv.includes('--uma-vez')
  log('iniciada', umaVez ? '(uma vez)' : `(a cada ${INTERVALO_MS / 1000}s)`)
  do {
    try {
      await processarFila()
    } catch (err) {
      log('erro lendo a fila:', err.message)
    }
    if (!umaVez) await dormir(INTERVALO_MS)
  } while (!umaVez)
}

main()
