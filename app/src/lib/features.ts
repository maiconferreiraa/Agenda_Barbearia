/**
 * Cartão recorrente da InfinitePay (link de "Planos e cobranças" colado no plano).
 * A InfinitePay não avisa o sistema (sem webhook/API para planos — confirmado
 * pelo suporte em 12/11/2026): o dono confirma o 1º pagamento e marca
 * "Cartão recusado" quando o app da InfinitePay mostrar recusa.
 */
export const CARD_RECURRING_ENABLED = true

/**
 * Ligar a ficha do sistema antigo à conta do app (código no WhatsApp).
 * EM ESPERA a pedido do usuário (12/11/2026): pronto, mas desligado.
 * Para ligar: true aqui e LINK_ACCOUNT_ENABLED em worker/src/api/linkAccount.ts.
 */
export const LINK_ACCOUNT_ENABLED = false
