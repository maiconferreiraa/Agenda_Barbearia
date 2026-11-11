# Ponte WhatsApp

Manda pelo WhatsApp **da barbearia** (número/chip só dela) os avisos de
mensalidade: link de pagamento InfinitePay, véspera, atraso, lembretes,
plano vencido e pagamento confirmado.

```
Cloud Functions ──grava──▶ Firestore whatsappOutbox ──lê──▶ ponte.mjs (PC ligado) ──▶ WhatsApp da barbearia
```

As Cloud Functions rodam no Google e não seguram uma conexão de WhatsApp,
por isso a fila no meio. A ponte é independente de qualquer outro sistema do PC.

## Ligar (uma vez)

1. **Chip da barbearia** com WhatsApp instalado num celular.
2. **Chave do Firebase**: console do Firebase → projeto `barbearia-prime-app` →
   ⚙️ Configurações do projeto → Contas de serviço → **Gerar nova chave privada**.
   Salve como `~/.config/barbearia-prime/service-account.json`
   (nunca dentro do repositório).
3. `npm install` nesta pasta.
4. `npm start` → aparece um **QR Code** no terminal (também salvo em
   `~/.config/barbearia-prime/qr-whatsapp.png`). No celular da barbearia:
   WhatsApp → Aparelhos conectados → Conectar um aparelho → escanear.
   A sessão fica em `~/.config/barbearia-prime/whatsapp-sessao` (não precisa escanear de novo).
5. **Deixar rodando sempre**:
   ```bash
   cp barbearia-ponte-whatsapp.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now barbearia-ponte-whatsapp
   journalctl --user -u barbearia-ponte-whatsapp -f   # ver o log
   ```

## Regras de envio

- Só entre 8h e 21h (Brasília); fora disso a mensagem espera.
- 20 s entre mensagens e no máximo 40 por dia (`maxPorDia` em
  `~/.config/barbearia-prime/ponte.json`) — evita bloqueio do número.
- Número sem WhatsApp → `failed` ("número sem WhatsApp").
- Até 3 tentativas por mensagem em caso de erro (`failed` depois, com `lastError`).
- Mensagem com mais de 48 h na fila (PC desligado) vira `expired` e não sai.
- Telefone vem do cadastro do cliente ("Telefone / WhatsApp"); o aviso de atraso
  para o dono vai pro telefone em Configurações.
- Desvincular: WhatsApp → Aparelhos conectados → sair, e apagar a pasta `whatsapp-sessao`.
