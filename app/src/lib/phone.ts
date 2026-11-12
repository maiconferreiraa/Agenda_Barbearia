/** Celular: DDD + 9 + 8 dígitos, só números (ex.: 31995012927). Mesma regra do servidor. */
export const PHONE_PATTERN = '[1-9]{2}9[0-9]{8}'
export const PHONE_EXAMPLE = '31995012927'
export const PHONE_RULE = `Só números, DDD + 9 dígitos. Ex.: ${PHONE_EXAMPLE}`

export function isValidPhone(v: string) {
  return new RegExp(`^${PHONE_PATTERN}$`).test(v)
}

/** Tira tudo que não é número (e o +55 de quem cola com código do país). */
export function cleanPhone(v: string | null | undefined) {
  let d = (v ?? '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  return d.slice(0, 11)
}
