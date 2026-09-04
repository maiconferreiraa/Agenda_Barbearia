# Barbearia Primer

Sistema completo de agenda, planos mensais e cobrança recorrente para a Barbearia Primer.

- **PWA** (React + Vite + TypeScript + Tailwind): funciona no computador, notebook e celular, instalável como app, tudo sincronizado em tempo real (Firestore).
- **Backend** (Firebase: Auth, Firestore, Cloud Functions, Hosting, Cloud Messaging).
- **Pagamento**: Mercado Pago — assinatura recorrente (Preapproval API) cobrando automaticamente no cartão do cliente todo mês.
- **Notificações**: sino no app (tempo real) + push nativo (funciona até com o app fechado), para: novo agendamento, plano escolhido, pagamento recebido/recusado, plano vencendo e plano vencido.

## Estrutura

```
barbearia_primer/
  app/          → o PWA (React)
  functions/    → Cloud Functions (integração com Mercado Pago, webhooks, notificações, agenda)
  firestore.rules
  firestore.indexes.json
  firebase.json
```

## 1. Pré-requisitos

- Node.js 20+
- Uma conta no [Firebase](https://console.firebase.google.com) (grátis para começar)
- Uma conta no [Mercado Pago](https://www.mercadopago.com.br/developers) com Access Token (você já tem)
- `npm install -g firebase-tools` e depois `firebase login`

## 2. Criar o projeto Firebase

1. No [Console Firebase](https://console.firebase.google.com), crie um projeto novo (ex: `barbearia-primer`).
2. **Plano Blaze** (pay-as-you-go): necessário para Cloud Functions. Tem uma cota gratuita generosa — para uma barbearia normal, o custo tende a ficar próximo de R$ 0.
3. Ative:
   - **Authentication** → método "E-mail/senha".
   - **Firestore Database** → criar banco (modo produção, região `southamerica-east1`).
   - **Cloud Messaging** → em "Certificados Web Push", gere um par de chaves (isso é a `VAPID key`).
   - **Hosting**.
4. Em "Configurações do projeto → Seus apps", crie um app Web e copie as credenciais (`apiKey`, `authDomain`, etc).
5. Rode `firebase use --add` dentro de `barbearia_primer/` e selecione esse projeto (isso atualiza o `.firebaserc`).

## 3. Configurar o app (frontend)

```bash
cd app
cp .env.example .env
```

Preencha o `.env` com as credenciais do passo 2 (`VITE_FIREBASE_*`) e a `VITE_FIREBASE_VAPID_KEY`.

## 4. Configurar as Cloud Functions

As credenciais sensíveis (Mercado Pago e o código de proprietário) ficam como **secrets**, nunca no código nem no app:

```bash
cd functions
firebase functions:secrets:set MP_ACCESS_TOKEN
firebase functions:secrets:set MP_WEBHOOK_SECRET
firebase functions:secrets:set OWNER_INVITE_CODE
```

- `MP_ACCESS_TOKEN`: em Mercado Pago Developers → Suas integrações → sua aplicação → Credenciais de produção (ou de teste, para testar antes).
- `MP_WEBHOOK_SECRET`: gerado quando você cria o webhook (passo 6 abaixo).
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
# na raiz de barbearia_primer/
cd app && npm run build && cd ..
firebase deploy
```

Isso publica: regras/índices do Firestore, as Cloud Functions e o Hosting (PWA).

Depois do deploy, sua URL pública será algo como `https://SEU-PROJETO.web.app`.

## 6. Configurar o webhook no Mercado Pago

1. No painel do Mercado Pago → Sua aplicação → Webhooks → **Configurar notificações**.
2. URL: `https://SEU-PROJETO.web.app/api/mercadopago-webhook`
3. Eventos: marque **"Assinaturas e Planos" (preapproval)** e **"Pagamentos" (payment)**.
4. Copie a "Chave secreta" gerada e salve como `MP_WEBHOOK_SECRET` (passo 4). Depois rode `firebase deploy --only functions` de novo para aplicar.

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

- Cliente escolhe um plano → o app chama a Function `createPreapproval`, que cria uma **assinatura (Preapproval)** no Mercado Pago e leva o cliente para autorizar o cartão.
- O Mercado Pago cobra automaticamente todo mês e avisa o sistema via **webhook** (`mercadoPagoWebhook`), que atualiza o status da assinatura e dispara as notificações (pagamento recebido/recusado).
- O proprietário pode cancelar a qualquer momento em **Assinaturas → Cancelar** — isso chama a Function `cancelSubscription`, que cancela a cobrança direto no Mercado Pago.
- Todos os dias às 9h (`checkExpirations`), o sistema verifica assinaturas vencendo (≤ 3 dias) ou já vencidas e notifica dono e cliente.
- Agendamentos **sem** plano ativo (ou sem crédito restante no mês) são marcados como "pagamento no balcão" — o cliente paga na hora, na barbearia. Se no futuro você quiser cobrar também os avulsos pelo Mercado Pago (Checkout Pro), me avise que eu adiciono esse fluxo.

## Limitações conhecidas / próximos passos sugeridos

- O pagamento avulso (fora do plano) hoje é sempre "pagar no balcão" — cobrança avulsa online não foi incluída para manter o foco no fluxo de assinatura, mas é uma extensão natural.
- A data de renovação (`currentPeriodEnd`) usa a data informada pelo Mercado Pago quando disponível; sem ela, estima 30 dias — normalmente essa data vem certinha da API.
- Teste primeiro com credenciais de **teste (sandbox)** do Mercado Pago antes de usar as credenciais de produção.
