import clsx from 'clsx'
import logo from '../assets/logo.jpg'

/** Logo oficial da barbearia (placa escura com "Prime"), igual nos dois temas. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <img
      src={logo}
      alt="Barbearia Prime"
      width={720}
      height={344}
      className={clsx(
        'w-auto rounded-md',
        size === 'sm' && 'h-9',
        size === 'md' && 'h-14',
        size === 'lg' && 'h-28 rounded-xl shadow-md',
      )}
    />
  )
}
