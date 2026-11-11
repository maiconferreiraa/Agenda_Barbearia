# Barbearia Prime

Sistema completo de agenda, planos mensais e cobrança recorrente para a Barbearia Prime.

- **PWA** (React + Vite + TypeScript + Tailwind): funciona no computador, notebook e celular, instalável como app, tudo sincronizado em tempo real (Firestore).
- **Backend** (Firebase: Auth, Firestore, Cloud Functions, Hosting, Cloud Messaging).
- **Pagamento**: InfinitePay (Checkout Integrado) — o sistema gera um link de mensalidade por mês (Pix ou cartão), avisa o cliente, confirma o pagamento pelo webhook e avisa quem atrasar.
- **Notificações**: sino no app (tempo real) + push nativo (funciona até com o app fechado), para: novo agendamento, plano escolhido, pagamento recebido/recusado, plano vencendo e plano vencido.

## Estrutura

```
barbearia_prime/
  app/          → o PWA (React)
  functions/    → Cloud Functions (integração com InfinitePay, webhook, notificações, agenda)
  firestore.rules
  firestore.indexes.json
  firebase.json
```

## 1. Pré-requisitos

- Node.js 20+
- Uma conta no [Firebase](https://console.firebase.google.com) (grátis para começar)
- Uma conta na [InfinitePay](https://www.infinitepay.io) — o dono só cola a InfiniteTag em **Configurações → Pagamentos** e toca "Conectar"
- `npm install -g firebase-tools` e depois `firebase login`

## 2. Criar o projeto Firebase

1. No [Console Firebase](https://console.firebase.google.com), crie um projeto novo (ex: `barbearia-prime`).
2. **Plano Blaze** (pay-as-you-go): necessário para Cloud Functions. Tem uma cota gratuita generosa — para uma barbearia normal, o custo tende a ficar próximo de R$ 0.
3. Ative:
   - **Authentication** → método "E-mail/senha".
   - **Firestore Database** → criar banco (modo produção, região `southamerica-east1`).
   - **Cloud Messaging** → em "Certificados Web Push", gere um par de chaves (isso é a `VAPID key`).
   - **Hosting**.
4. Em "Configurações do projeto → Seus apps", crie um app Web e copie as credenciais (`apiKey`, `authDomain`, etc).
5. Rode `firebase use --add` dentro de `barbearia_prime/` e selecione esse projeto (isso atualiza o `.firebaserc`).

## 3. Configurar o app (frontend)

```bash
cd app
cp .env.example .env
```

Preencha o `.env` com as credenciais do passo 2 (`VITE_FIREBASE_*`) e a `VITE_FIREBASE_VAPID_KEY`.

## 4. Configurar as Cloud Functions

O código de proprietário fica como **secret**, nunca no código nem no app:

```bash
cd functions
firebase functions:secrets:set OWNER_INVITE_CODE
```

- `OWNER_INVITE_CODE`: invente uma senha só sua — é o código que, digitado na tela de cadastro, transforma aquela conta em "proprietário" da barbearia. Guarde em local seguro e não compartilhe.

Também existe um parâmetro público (não secreto), a URL do app publicado:

```bash
firebase functions:config:env  # ou simplesmente faça o deploy: ele pergunta o valor de APP_BASE_URL na primeira vez
```

Se preferir definir antes, crie `functions/.env.<PROJECT_ID>` com:

```
APP_BASE_URL=https://SEU-PROJETO.web.app
```

## 5. Build e deploy

```bash
# na raiz de barbearia_prime/
cd app && npm run build && cd ..
firebase deploy
```

Isso publica: regras/índices do Firestore, as Cloud Functions e o Hosting (PWA).

Depois do deploy, sua URL pública será algo como `https://SEU-PROJETO.web.app`.

## 6. Webhook da InfinitePay

Não precisa cadastrar nada no painel: cada link de mensalidade já sai com o webhook
`https://SEU-PROJETO.web.app/api/infinitepay-webhook` (vem do `APP_BASE_URL`).
O aviso da InfinitePay não tem assinatura, então o sistema sempre confirma o pagamento
em `/payment_check` antes de dar baixa.

## 7. Primeiro acesso

1. Abra o app publicado, clique em "Cadastre-se".
2. No campo **"Código do proprietário"**, digite o `OWNER_INVITE_CODE` que você definiu. Essa conta vira a conta do dono da barbearia.
3. Demais pessoas se cadastram **sem** esse código — viram clientes automaticamente.
4. Como proprietário: vá em **Serviços** e clique em "Adicionar serviços padrão" (corte, barba, sobrancelha, hidratação, pintura, pezinho — dá pra editar/adicionar outros depois). Configure o **horário de funcionamento** em Configurações. Crie seus **Planos** (ex: "4 cortes por mês").

## 8. Rodando localmente (com emuladores, sem custo)

```bash
cd functions && npm run build && cd ..
firebase emulators:start
# em outro terminal:
cd app && npm run dev
```

Aponte o app para os emuladores adicionando isto no `app/src/firebase.ts` (temporariamente, em desenvolvimento) — ou peça para eu já deixar isso plugado atrás de uma flag `VITE_USE_EMULATORS`, se for usar bastante o modo local.

## Como funciona o pagamento

A API da InfinitePay só gera **links de pagamento avulsos** — não existe débito automático
no cartão por API. Por isso a mensalidade é um link novo por mês:

- Cliente escolhe um plano → a Function `subscribePlan` cria a assinatura (`pending`) e a
  1ª mensalidade em `invoices`, com link InfinitePay (Pix ou cartão). O cliente é levado ao checkout.
- Pagou → a InfinitePay chama o **webhook** (`infinitePayWebhook`), que confirma em `/payment_check`
  e ativa o plano por 1 mês. Quando o cliente volta do checkout, o app também chama
  `confirmInvoicePayment` — se o webhook atrasar, a baixa sai do mesmo jeito.
- Todo dia às 9h (`dailyBilling`), a régua de cobrança:
  - gera a mensalidade do mês seguinte **5 dias antes** do vencimento e avisa o cliente (push + sininho, com link);
  - avisa na **véspera** do vencimento;
  - no **atraso**: marca a assinatura "em atraso" (créditos pausados) e avisa **dono e cliente**;
  - lembra o cliente a cada **3 dias**; com **10 dias** de atraso o plano vira "vencido" (pagando depois, reativa);
  - assinatura que nunca pagou a 1ª mensalidade é descartada após 7 dias;
  - zera os créditos no dia em que começa o mês já pago.
- Prazos ficam no topo de `functions/src/scheduled/dailyBilling.ts`.
- A InfiniteTag é do dono da barbearia: ele cola em **Configurações → Pagamentos** (aceita `$tag`, `@tag` ou o link da loja). O botão "Conectar" (`connectInfinitePay`) cria um link de teste de R$ 1,00 pra confirmar que a InfinitePay aceita, e só então salva em `businessSettings/pagamento`.
- Os mesmos avisos (com o link de pagamento) também vão por **WhatsApp**, por um número próprio da barbearia, via `ponte-whatsapp/` (veja o README de lá).
- O proprietário pode cancelar em **Assinaturas → Cancelar** (`cancelSubscription`): para de gerar mensalidades e cancela a que estiver em aberto.
- O **cliente** também cancela o próprio plano em **Assinatura → Cancelar plano** (`cancelMyPlan`): se estiver em dia, continua valendo até o fim do mês pago e não recebe mais cobranças (até lá pode tocar "Quero manter meu plano"); se estiver aguardando pagamento ou em atraso, cancela na hora.
- O cliente **desmarca horário** em **Horários → Desmarcar** até 2 h antes (`cancelMyAppointment`; prazo em `functions/src/lib/cancelRules.ts`). Com menos de 2 h, só falando com a barbearia.
- Horário cancelado — pelo cliente ou pelo dono na agenda — **devolve o crédito do plano** automaticamente (`onAppointmentCanceled`), se for do mês atual.
- Agendamentos **sem** plano ativo (ou sem crédito restante no mês) são marcados como "pagamento no balcão".

## Limitações conhecidas / próximos passos sugeridos

- O link da InfinitePay continua pagável mesmo depois de cancelado no sistema (sem API Key não dá para limitar a um pagamento). Se alguém pagar uma mensalidade cancelada, o dono recebe um aviso para avaliar estorno.
- O formato da resposta de `POST /links` não está documentado pela InfinitePay; `functions/src/lib/infinitepay.ts` aceita `url`/`link`/`checkout_url`. Confira no 1º teste real.
- Teste com uma mensalidade de R$ 1,00 (valor mínimo da InfinitePay) antes de liberar para clientes.
