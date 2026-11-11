# Barbearia Prime

Sistema de agenda, planos mensais e cobrança de mensalidade para a Barbearia Prime.

- **App** (React + Vite + TypeScript + Tailwind): funciona no computador e no celular, instalável, sincronizado em tempo real.
- **Firebase plano grátis (Spark)**: login (Authentication), banco (Firestore) e push (Cloud Messaging). **Não precisa de Blaze.**
- **Cloudflare Worker** (`worker/`, plano grátis): publica o app e roda o servidor — agenda, planos, InfinitePay, webhook e a régua diária de cobrança.
- **Pagamento**: InfinitePay (Checkout Integrado) — um link de mensalidade por mês (Pix ou cartão), confirmação pelo webhook e aviso de atraso.
- **Notificações**: sininho no app + push no celular; WhatsApp opcional (`ponte-whatsapp/`).

## Estrutura

```
barbearia_prime/
  app/             → o app (React)
  worker/          → servidor no Cloudflare (/api/*, webhook, cron) + publica o app
  ponte-whatsapp/  → (opcional) envia os avisos pelo WhatsApp da barbearia
  firestore.rules  → regras do banco (o app só lê; quem escreve o que importa é o servidor)
```

## Publicar

### 1. Chave do Firebase (uma vez)

Console do Firebase → projeto `barbearia-prime-app` → ⚙️ Configurações do projeto →
**Contas de serviço** → **Gerar nova chave privada**. Salve como
`~/.config/barbearia-prime/service-account.json` (nunca dentro do repositório).
É grátis e é a mesma chave usada pela ponte do WhatsApp.

### 2. Regras do banco (sempre que mudar `firestore.rules`)

```bash
npx firebase-tools deploy --only firestore --project barbearia-prime-app
```

### 3. Servidor + app no Cloudflare

```bash
cd worker
npm install
npm run deploy          # gera o app e publica tudo em https://barbearia-prime.maicon-jbf.workers.dev
# segredos (uma vez):
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT < ~/.config/barbearia-prime/service-account.json
npx wrangler secret put OWNER_INVITE_CODE   # invente um código só seu
```

`OWNER_INVITE_CODE` é o código que, digitado no cadastro, transforma a conta em "proprietário".

### Limites do plano grátis (sobra para uma barbearia)

- Cloudflare Workers: 100 mil acessos/dia; até 50 chamadas externas por acesso — por isso a
  régua de cobrança roda em pedaços, a cada 10 min das 9h às 20h50.
- Firestore: 50 mil leituras e 20 mil gravações por dia, 1 GB de dados.

## Rodar localmente

```bash
cd app && npm run dev          # app em http://localhost:5173
cd worker && npx wrangler dev  # servidor local (precisa de worker/.dev.vars com os segredos)
```

Para o app local falar com o servidor publicado: `VITE_API_BASE=https://barbearia-prime.maicon-jbf.workers.dev` no `app/.env`.

## Como funciona o pagamento

A API da InfinitePay só gera **links de pagamento avulsos** — não existe débito automático
no cartão por API. Por isso a mensalidade é um link novo por mês:

- Cliente escolhe um plano → `/api/subscribePlan` cria a assinatura (`pending`) e a
  1ª mensalidade em `invoices`, com link InfinitePay (Pix ou cartão). O cliente é levado ao checkout.
- Pagou → a InfinitePay chama o **webhook** (`/api/infinitepay-webhook`), que confirma em `/payment_check`
  e ativa o plano por 1 mês. Quando o cliente volta do checkout, o app também chama
  `/api/confirmInvoicePayment` — se o webhook atrasar, a baixa sai do mesmo jeito.
- Uma vez por dia por assinatura (`worker/src/scheduled.ts`, a partir das 9h), a régua de cobrança:
  - gera a mensalidade do mês seguinte **5 dias antes** do vencimento e avisa o cliente (push + sininho, com link);
  - avisa na **véspera** do vencimento;
  - no **atraso**: marca a assinatura "em atraso" (créditos pausados) e avisa **dono e cliente**;
  - lembra o cliente a cada **3 dias**; com **10 dias** de atraso o plano vira "vencido" (pagando depois, reativa);
  - assinatura que nunca pagou a 1ª mensalidade é descartada após 7 dias;
  - zera os créditos no dia em que começa o mês já pago.
- Prazos ficam no topo de `worker/src/scheduled.ts`.
- A InfiniteTag é do dono da barbearia: ele cola em **Configurações → Pagamentos** (aceita `$tag`, `@tag` ou o link da loja). O botão "Conectar" (`/api/connectInfinitePay`) cria um link de teste de R$ 1,00 pra confirmar que a InfinitePay aceita, e só então salva em `businessSettings/pagamento`.
- Os mesmos avisos (com o link de pagamento) também vão por **WhatsApp**, por um número próprio da barbearia, via `ponte-whatsapp/` (veja o README de lá).
- O proprietário pode cancelar em **Assinaturas → Cancelar** (`/api/cancelSubscription`): para de gerar mensalidades e cancela a que estiver em aberto.
- O **cliente** também cancela o próprio plano em **Assinatura → Cancelar plano** (`/api/cancelMyPlan`): se estiver em dia, continua valendo até o fim do mês pago e não recebe mais cobranças (até lá pode tocar "Quero manter meu plano"); se estiver aguardando pagamento ou em atraso, cancela na hora.
- O cliente **desmarca horário** em **Horários → Desmarcar** até 2 h antes (`/api/cancelMyAppointment`; prazo em `worker/src/api/booking.ts`). Com menos de 2 h, só falando com a barbearia.
- Horário cancelado — pelo cliente ou pelo dono na agenda — **devolve o crédito do plano** automaticamente, se for do mês atual (o dono muda status pela agenda via `/api/setAppointmentStatus`).
- Agendamentos **sem** plano ativo (ou sem crédito restante no mês) são marcados como "pagamento no balcão".

## Limitações conhecidas / próximos passos sugeridos

- O link da InfinitePay continua pagável mesmo depois de cancelado no sistema (sem API Key não dá para limitar a um pagamento). Se alguém pagar uma mensalidade cancelada, o dono recebe um aviso para avaliar estorno.
- O formato da resposta de `POST /links` não está documentado pela InfinitePay; `worker/src/infinitepay.ts` aceita `url`/`link`/`checkout_url`. Confira no 1º teste real.
- Teste com uma mensalidade de R$ 1,00 (valor mínimo da InfinitePay) antes de liberar para clientes.
