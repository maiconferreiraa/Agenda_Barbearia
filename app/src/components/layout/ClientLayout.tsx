import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { Logo } from '../Logo'
import { NotificationBell } from '../NotificationBell'
import { EnablePush } from '../EnablePush'
import { useAuth } from '../../contexts/AuthContext'

const NAV = [
  { to: '/app', label: 'Agendar', icon: '✂️', end: true },
  { to: '/app/plans', label: 'Planos', icon: '🏷️' },
  { to: '/app/appointments', label: 'Horários', icon: '🗓️' },
  { to: '/app/subscription', label: 'Assinatura', icon: '💳' },
]

export function ClientLayout() {
  const { logout } = useAuth()

  return (
    <div className="min-h-screen bg-ink text-neutral-100">
      <header className="flex items-center justify-between border-b border-ink-border bg-ink-soft px-4 py-3">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            onClick={logout}
            className="rounded-full border border-ink-border bg-ink-card px-3 py-2 text-xs text-neutral-400 hover:text-red-400"
          >
            Sair
          </button>
        </div>
      </header>

      <EnablePush />

      <main className="mx-auto max-w-2xl p-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-border bg-ink-soft/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl justify-around">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px]',
                  isActive ? 'text-gold-light' : 'text-neutral-500',
                )
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span className="w-full truncate text-center">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
