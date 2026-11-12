// AVISO DE PROVENIÊNCIA — Gerado no ambiente da Prime Holding.
// Modelo: Claude Opus 5.5 (claude-opus-5-5)
// Solicitante: 1.home.automation.technology@gmail.com
// Este aviso é obrigatório e não deve ser removido.

/**
 * Conexão de WhatsApp PRÓPRIA da barbearia (chip/número só dela).
 * Não tem nenhuma relação com outros robôs do PC: sessão separada em
 * ~/.config/barbearia-prime/whatsapp-sessao.
 *
 * Vincular o número: o dono abre o app → Configurações → WhatsApp da barbearia
 * e escaneia o QR (a ponte publica o QR no banco, só o dono lê). O QR também
 * aparece no terminal e em ~/.config/barbearia-prime/qr-whatsapp.png.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcodeTerminal from 'qrcode-terminal'
import QRCode from 'qrcode'

const PASTA = path.join(os.homedir(), '.config', 'barbearia-prime')
export const SESSAO_DIR = path.join(PASTA, 'whatsapp-sessao')
export const QR_PNG = path.join(PASTA, 'qr-whatsapp.png')

let sock = null
let conectado = false
let deslogado = false
/** Avisado a cada mudança: { status: 'qr' | 'connected' | 'disconnected', qr?, phone? } */
let aoMudar = () => {}

export function quandoMudar(fn) {
  aoMudar = fn
}

function log(...args) {
  console.log(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), '[whatsapp]', ...args)
}

export function estaConectado() {
  return conectado && !!sock
}

export function estaDeslogado() {
  return deslogado
}

export async function conectar() {
  fs.mkdirSync(SESSAO_DIR, { recursive: true, mode: 0o700 })
  const { state, saveCreds } = await useMultiFileAuthState(SESSAO_DIR)
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      log('Vincule o número da barbearia: WhatsApp → Aparelhos conectados → Conectar um aparelho')
      qrcodeTerminal.generate(qr, { small: true })
      await QRCode.toFile(QR_PNG, qr, { width: 400 }).catch(() => {})
      log(`QR também salvo em: ${QR_PNG}`)
      aoMudar({ status: 'qr', qr })
    }
    if (connection === 'open') {
      conectado = true
      deslogado = false
      fs.rmSync(QR_PNG, { force: true })
      const phone = String(sock.user?.id ?? '').split(':')[0].split('@')[0]
      log('Conectado.', phone ? `(${phone.slice(0, 6)}…)` : '')
      aoMudar({ status: 'connected', phone })
    }
    if (connection === 'close') {
      conectado = false
      const status = lastDisconnect?.error?.output?.statusCode
      if (status === DisconnectReason.loggedOut) {
        // Desvinculado no celular ou pelo app: limpa a sessão e já mostra QR novo.
        deslogado = true
        log('Número desvinculado — gerando QR novo para conectar outro.')
        aoMudar({ status: 'disconnected' })
        fs.rmSync(SESSAO_DIR, { recursive: true, force: true })
        setTimeout(() => conectar().catch((e) => log('erro ao reconectar:', e.message)), 3000)
      } else {
        log('Conexão caiu — reconectando em 5 s...')
        setTimeout(() => conectar().catch((e) => log('erro ao reconectar:', e.message)), 5000)
      }
    }
  })
}

/**
 * Envia texto para um número 55DDDNÚMERO.
 * Devolve 'ok' | 'sem_whatsapp' | 'desconectado'.
 */
/** Pasta dos arquivos que a ponte pode mandar (manual em PDF etc.). Nada fora dela sai. */
export const PASTA_ARQUIVOS = path.join(os.homedir(), '.config', 'barbearia-prime', 'arquivos')

/** Manda um arquivo (ex.: PDF) com legenda. `arquivo` = nome dentro de PASTA_ARQUIVOS. */
export async function enviarArquivo(numero, arquivo, legenda, mimetype = 'application/pdf') {
  if (!estaConectado()) return 'desconectado'
  const caminho = path.join(PASTA_ARQUIVOS, path.basename(String(arquivo)))
  if (!fs.existsSync(caminho)) return 'arquivo não encontrado'
  const [info] = await sock.onWhatsApp(numero)
  if (!info?.exists) return 'sem_whatsapp'
  await sock.sendMessage(info.jid, {
    document: fs.readFileSync(caminho),
    fileName: path.basename(caminho),
    mimetype,
    caption: legenda || undefined,
  })
  return 'ok'
}

export async function enviarTexto(numero, texto) {
  if (!estaConectado()) return 'desconectado'
  const [info] = await sock.onWhatsApp(numero)
  if (!info?.exists) return 'sem_whatsapp'
  await sock.sendMessage(info.jid, { text: texto })
  return 'ok'
}

/** Desvincula o número (botão "Desconectar" no app). Depois aparece um QR novo. */
export async function desconectar() {
  if (!sock) return
  try {
    await sock.logout()
  } catch {
    // se já estava fora, o 'close' acima cuida de limpar e gerar QR novo
    sock.end?.(undefined)
  }
}

/**
 * Conectar sem QR (dono só com o celular): gera o código de 8 letras para
 * WhatsApp → Aparelhos conectados → Conectar um aparelho → "Conectar com
 * número de telefone". `numero` no formato 55DDDNÚMERO.
 */
export async function pedirCodigo(numero) {
  if (estaConectado()) throw new Error('O WhatsApp já está conectado.')
  if (!sock) throw new Error('Conexão ainda iniciando, tente de novo em instantes.')
  const code = await sock.requestPairingCode(numero)
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}
