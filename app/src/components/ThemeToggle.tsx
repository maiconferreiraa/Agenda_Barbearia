import { useState } from 'react'
import clsx from 'clsx'

type Tema = 'claro' | 'escuro'

function aplicar(tema: Tema) {
  const root = document.documentElement
  if (tema === 'escuro') root.dataset.theme = 'dark'
  else delete root.dataset.theme
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', tema === 'escuro' ? '#0b0b0c' : '#ffffff')
  try {
    localStorage.setItem('tema', tema)
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

/** Lua = muda pro escuro; sol = volta pro claro. A escolha fica salva no aparelho. */
export function ThemeToggle({ className }: { className?: string }) {
  const [tema, setTema] = useState<Tema>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'escuro' : 'claro',
  )
  const escuro = tema === 'escuro'

  function trocar() {
    const novo: Tema = escuro ? 'claro' : 'escuro'
    aplicar(novo)
    setTema(novo)
  }

  return (
    <button
      type="button"
      onClick={trocar}
      aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
      title={escuro ? 'Tema claro' : 'Tema escuro'}
      className={clsx(
        'flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-ink-card hover:text-neutral-100',
        className,
      )}
    >
      {escuro ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
