import type { HTMLAttributes } from 'react'
import clsx from 'clsx'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-ink-border bg-ink-card/60 p-4 shadow-sm backdrop-blur-sm',
        className,
      )}
      {...rest}
    />
  )
}
