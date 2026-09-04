import { type ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  loading,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' &&
          'bg-gradient-to-b from-gold-light to-gold text-ink shadow-[0_1px_0_rgba(255,255,255,0.3)_inset] hover:brightness-110 active:brightness-95',
        variant === 'secondary' &&
          'border border-ink-border bg-ink-card text-gold-light hover:border-gold-dark',
        variant === 'ghost' && 'text-gold-light hover:bg-ink-card',
        variant === 'danger' &&
          'border border-red-900/50 bg-red-950/40 text-red-300 hover:bg-red-950/70',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}
