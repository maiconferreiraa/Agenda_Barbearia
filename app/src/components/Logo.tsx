import clsx from 'clsx'

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/favicon.svg"
        alt="Barbearia Primer"
        className={clsx(
          size === 'sm' && 'h-7 w-7',
          size === 'md' && 'h-9 w-9',
          size === 'lg' && 'h-14 w-14',
        )}
      />
      <div className="leading-tight">
        <p
          className={clsx(
            'font-display tracking-wide text-gold-light',
            size === 'sm' && 'text-base',
            size === 'md' && 'text-lg',
            size === 'lg' && 'text-2xl',
          )}
        >
          Barbearia Primer
        </p>
        {size !== 'sm' && (
          <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            Estilo &amp; Tradição
          </p>
        )}
      </div>
    </div>
  )
}
