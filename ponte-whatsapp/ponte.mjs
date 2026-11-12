// AVISO DE PROVENIÊNCIA — Gerado no ambiente da Prime Holding.
// Modelo: Claude Opus 5.5 (claude-opus-5-5)
// Solicitante: 1.home.automation.technology@gmail.com
// Este aviso é obrigatório e não deve ser removido.

/**
 * Ponte WhatsApp da Barbearia Prime.
 *
 * O servidor (Cloudflare Worker) grava as mensagens de cobrança em `whatsappOutbox`
 * (Firestore). Esta ponte roda num PC ligado, lê a fila e envia pelo WhatsApp
 * PRÓPRIO da barbearia (whatsapp.mjs — número/chip só dela), marcando cada
 * mensagem como enviada ou com falha.
 *
 * Configuração em ~/.config/barbearia-prime/ponte.json (fora do repositório):
 *   {
 *     "credenciais": "/caminho/service-account.json",  // chave da conta de serviço do Firebase
 *     "maxPorDia": 40                                   // opcional
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
import { conectar, desconectar, enviarTexto, estaConectado, estaDeslogado, pedirCodigo, quandoMudar } from './whatsapp.mjs'

const PASTA = path.join(os.homedir(), '.config', 'barbearia-prime')
const CONFIG_PATH = path.join(PASTA, 'ponte.json')
const CONTAGEM_PATH = path.join(PASTA, 'envios-hoje.json')

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
  if (!cfg.credenciais) throw new Error(`Campo "credenciais" faltando em ${CONFIG_PATH}`)
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

const MAX_POR_DIA = cfg.maxPorDia ?? 40

function hojeSP() {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** Quantas mensagens já saíram hoje (guardado em arquivo: sobrevive a reinício). */
function enviadosHoje() {
  try {
    const c = JSON.parse(fs.readFileSync(CONTAGEM_PATH, 'utf-8'))
    return c.dia === hojeSP() ? c.total : 0
  } catch {
    return 0
  }
}

function contarEnvio() {
  fs.writeFileSync(CONTAGEM_PATH, JSON.stringify({ dia: hojeSP(), total: enviadosHoje() + 1 }))
}

/** Mostra no sininho do dono que um aviso não saiu, pra ele corrigir o telefone do cliente. */
async function avisarDonoFalha(msg, motivo) {
  const numero = String(msg.to ?? '').replace(/^55/, '')
  try {
    await db.collection('notifications').add({
      type: 'whatsapp_failed',
      title: '📵 WhatsApp não enviado',
      message: `A mensagem para ${numero} ${motivo}. Confira o telefone do cliente em Clientes.`,
      relatedId: msg.relatedId ?? null,
      targetRole: 'owner',
      targetUserId: null,
      link: '/owner/clients',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    log('não consegui avisar o dono da falha:', err.message)
  }
}

async function processarFila() {
  const hora = horaSaoPaulo()
  if (hora < HORA_INICIO || hora >= HORA_FIM) return
  if (!estaConectado()) return

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

    if (enviadosHoje() >= MAX_POR_DIA) {
      log(`limite de ${MAX_POR_DIA} mensagens por dia atingido — o resto sai amanhã`)
      return
    }
    if (enviados > 0) await dormir(PAUSA_ENTRE_ENVIOS_MS)

    let resultado
    try {
      resultado = await enviarTexto(msg.to, msg.text)
    } catch (err) {
      resultado = `erro: ${err.message}`
    }

    if (resultado === 'ok') {
      contarEnvio()
      await doc.ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp() })
      enviados++
      log('enviada:', doc.id, msg.kind, '→', msg.to.slice(0, 6) + '…')
      continue
    }
    if (resultado === 'desconectado') {
      log('WhatsApp desconectado — tento de novo no próximo ciclo')
      return
    }
    if (resultado === 'sem_whatsapp') {
      await doc.ref.update({ status: 'failed', lastError: 'número sem WhatsApp' })
      log('número sem WhatsApp:', doc.id, msg.to.slice(0, 6) + '…')
      await avisarDonoFalha(msg, 'esse número não tem WhatsApp')
      continue
    }

    const tentativas = (msg.attempts ?? 0) + 1
    await doc.ref.update({
      attempts: tentativas,
      lastError: resultado,
      ...(tentativas >= MAX_TENTATIVAS ? { status: 'failed' } : {}),
    })
    if (tentativas >= MAX_TENTATIVAS) await avisarDonoFalha(msg, 'não foi entregue depois de 3 tentativas')
    log(`falha (${tentativas}/${MAX_TENTATIVAS}):`, doc.id, resultado)
  }
}

/**
 * Estado do WhatsApp no banco (private/whatsapp — só o dono lê nas regras):
 * o app mostra o QR para o dono escanear e o número conectado.
 * O botão "Desconectar" do app grava `command: 'logout'` aqui.
 */
const estadoRef = () => db.doc('private/whatsapp')

function publicarEstado(estado) {
  estadoRef()
    .set(
      {
        status: estado.status,
        qr: estado.qr ?? null,
        phone: estado.phone ?? null,
        // conectou: o código de pareamento não vale mais
        ...(estado.status === 'connected' ? { pairingCode: null, pairingError: null } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    .catch((err) => log('erro ao publicar estado do WhatsApp:', err.message))
}

function ouvirComandos() {
  estadoRef().onSnapshot(async (snap) => {
    const data = snap.data() ?? {}
    if (data.command === 'logout') {
      log('pedido de desconectar vindo do app')
      await estadoRef().update({ command: FieldValue.delete() }).catch(() => {})
      await desconectar()
      return
    }
    if (data.command === 'pair') {
      let numero = String(data.pairPhone ?? '').replace(/\D/g, '').replace(/^0+/, '')
      if (numero.length === 10 || numero.length === 11) numero = `55${numero}`
      await estadoRef().update({ command: FieldValue.delete(), pairPhone: FieldValue.delete() }).catch(() => {})
      if (!/^55\d{10,11}$/.test(numero)) {
        await estadoRef().update({ pairingCode: null, pairingError: 'Número inválido. Use DDD + número.' })
        return
      }
      try {
        const code = await pedirCodigo(numero)
        log('código de pareamento gerado para', numero.slice(0, 6) + '…')
        await estadoRef().update({ pairingCode: code, pairingError: null, pairingAt: FieldValue.serverTimestamp() })
      } catch (err) {
        log('erro ao gerar código:', err.message)
        await estadoRef().update({ pairingCode: null, pairingError: err.message })
      }
    }
  })
}

async function main() {
  const umaVez = process.argv.includes('--uma-vez')
  log('iniciada', umaVez ? '(uma vez)' : `(a cada ${INTERVALO_MS / 1000}s)`)
  quandoMudar(publicarEstado)
  if (!umaVez) ouvirComandos()
  await conectar()
  // dá tempo da conexão abrir (ou do QR aparecer) antes da 1ª leitura
  for (let i = 0; i < 30 && !estaConectado() && !estaDeslogado(); i++) await dormir(2000)
  do {
    try {
      await processarFila()
    } catch (err) {
      log('erro lendo a fila:', err.message)
    }
    if (!umaVez) await dormir(INTERVALO_MS)
  } while (!umaVez)
}

main().then(() => process.exit(0))
