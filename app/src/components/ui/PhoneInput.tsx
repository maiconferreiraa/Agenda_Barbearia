import type { InputHTMLAttributes } from 'react'
import { Input } from './Field'
import { PHONE_EXAMPLE, PHONE_PATTERN, PHONE_RULE, cleanPhone, isValidPhone } from '../../lib/phone'

/**
 * Campo de telefone que só aceita o formato 31995012927: tira espaços,
 * parênteses e traços enquanto digita e avisa se não tiver 11 dígitos certos.
 */
export function PhoneInput({
  label = 'Telefone / WhatsApp',
  value,
  onChange,
  ...rest
}: {
  label?: string
  value: string
  onChange: (digits: string) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const wrong = value.length > 0 && !isValidPhone(value)
  return (
    <div>
      <Input
        label={label}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        pattern={PHONE_PATTERN}
        title={PHONE_RULE}
        maxLength={11}
        placeholder={PHONE_EXAMPLE}
        value={value}
        onChange={(e) => onChange(cleanPhone(e.target.value))}
        {...rest}
      />
      <p className={`mt-1 text-xs ${wrong ? 'text-red-400' : 'text-neutral-500'}`}>
        {wrong ? `Confira o número: ${PHONE_RULE}` : `Só números com DDD, assim: ${PHONE_EXAMPLE}`}
      </p>
    </div>
  )
}
