# Ponte WhatsApp

Manda pelo WhatsApp os avisos de mensalidade (link de pagamento InfinitePay,
véspera, atraso, plano vencido, pagamento confirmado).

```
Cloud Functions ──grava──▶ Firestore whatsappOutbox ──lê──▶ ponte.mjs (este PC)
                                                               │ POST + token
                                                               ▼
                                         robô 8615 /api/barbearia/whatsapp ──▶ WhatsApp
```

As Cloud Functions rodam no Google e não alcançam o robô (que roda neste PC),
por isso a fila no meio.

## Ligar (uma vez)

1. **Chave do Firebase**: console do Firebase → projeto `barbearia-prime-app` →
   ⚙️ Configurações do projeto → Contas de serviço → **Gerar nova chave privada**.
   Salve o arquivo como `~/.config/barbearia-prime/service-account.json`
   (nunca dentro do repositório).
2. **Dependência**: `npm install` nesta pasta.
3. **Teste**: `npm run uma-vez` — processa a fila uma vez e sai.
4. **Deixar rodando sempre**:
   ```bash
   cp barbearia-ponte-whatsapp.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now barbearia-ponte-whatsapp
   journalctl --user -u barbearia-ponte-whatsapp -f   # ver o log
   ```

`~/.config/barbearia-prime/ponte.json` (já criado) guarda o caminho da chave,
a URL do robô e o token, que é o mesmo de `robo_ml_afiliados/data/barbearia-ponte.json`.

## Regras de envio

- Só entre 8h e 21h (Brasília); fora disso a mensagem espera.
- 20 s entre mensagens na ponte; o robô ainda exige 15 s e no máximo 40 por dia.
- Até 3 tentativas por mensagem (`failed` depois disso, com `lastError`).
- Mensagem com mais de 48 h na fila (PC desligado) vira `expired` e não sai.
- Telefone vem do cadastro do cliente ("Telefone / WhatsApp"); o aviso de atraso
  para o dono vai pro telefone em Configurações.
- Desligar sem mexer em nada: `"ativo": false` em `robo_ml_afiliados/data/barbearia-ponte.json`.
