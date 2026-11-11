/** Antecedência mínima para o CLIENTE desmarcar sozinho pelo app. */
export const CLIENT_CANCEL_MIN_HOURS = 2

export function formatDateTimeBr(date: Date) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}
