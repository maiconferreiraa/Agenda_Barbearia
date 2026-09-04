import { type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import clsx from 'clsx'

const controlClasses =
  'w-full rounded-lg border border-ink-border bg-ink-soft px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition-colors focus:border-gold'

interface FieldWrapProps {
  label?: string
  hint?: string
}

export function Input({
  label,
  hint,
  className,
  ...rest
}: FieldWrapProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium text-neutral-400">{label}</span>}
      <input className={clsx(controlClasses, className)} {...rest} />
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  )
}

export function Textarea({
  label,
  hint,
  className,
  ...rest
}: FieldWrapProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium text-neutral-400">{label}</span>}
      <textarea className={clsx(controlClasses, className)} {...rest} />
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  )
}

export function Select({
  label,
  hint,
  className,
  children,
  ...rest
}: FieldWrapProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium text-neutral-400">{label}</span>}
      <select className={clsx(controlClasses, className)} {...rest}>
        {children}
      </select>
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  )
}
