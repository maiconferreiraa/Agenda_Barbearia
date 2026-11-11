// AVISO DE PROVENIÊNCIA — Gerado no ambiente da Prime Holding.
// Modelo: Claude Opus 5.5 (claude-opus-5-5)
// Solicitante: 1.home.automation.technology@gmail.com
// Este aviso é obrigatório e não deve ser removido.

/**
 * Conexão de WhatsApp PRÓPRIA da barbearia (chip/número só dela).
 * Não tem nenhuma relação com outros robôs do PC: sessão separada em
 * ~/.config/barbearia-prime/whatsapp-sessao.
 *
 * Vincular o número (uma vez): rodar a ponte e escanear o QR que aparece no
 * terminal (também salvo como imagem em ~/.config/barbearia-prime/qr-whatsapp.png)
 * em WhatsApp → Aparelhos conectados → Conectar um aparelho.
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
    }
    if (connection === 'open') {
      conectado = true
      deslogado = false
      fs.rmSync(QR_PNG, { force: true })
      log('Conectado.')
    }
    if (connection === 'close') {
      conectado = false
      const status = lastDisconnect?.error?.output?.statusCode
      if (status === DisconnectReason.loggedOut) {
        deslogado = true
        log(`Número desvinculado. Apague ${SESSAO_DIR} e rode de novo para vincular.`)
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
export async function enviarTexto(numero, texto) {
  if (!estaConectado()) return 'desconectado'
  const [info] = await sock.onWhatsApp(numero)
  if (!info?.exists) return 'sem_whatsapp'
  await sock.sendMessage(info.jid, { text: texto })
  return 'ok'
}
