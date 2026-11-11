import { useState, type InputHTMLAttributes } from 'react'
import clsx from 'clsx'

/** Campo de senha com botão de olho para mostrar/esconder o que foi digitado. */
export function PasswordInput({
  label,
  hint,
  className,
  ...rest
}: { label?: string; hint?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium text-neutral-400">{label}</span>}
      <span className="relative block">
        <input
          type={visible ? 'text' : 'password'}
          autoCapitalize="none"
          autoCorrect="off"
          className={clsx(
            'w-full rounded-lg border border-ink-border bg-ink-soft py-2.5 pl-3 pr-11 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition-colors focus:border-gold',
            className,
          )}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Esconder senha' : 'Mostrar senha'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-400 hover:text-neutral-100"
        >
          {visible ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.4 10.4 0 0 1 12 4c5 0 9 4.5 10 8-.4 1.3-1.2 2.7-2.3 4M6.1 6.1C4.2 7.4 2.7 9.5 2 12c1 3.5 5 8 10 8 1.7 0 3.3-.5 4.6-1.3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M2 12c1-3.5 5-8 10-8s9 4.5 10 8c-1 3.5-5 8-10 8S3 15.5 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </span>
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  )
}
