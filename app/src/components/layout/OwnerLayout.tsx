import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { Logo } from '../Logo'
import { NotificationBell } from '../NotificationBell'
import { EnablePush } from '../EnablePush'
import { useAuth } from '../../contexts/AuthContext'

const NAV = [
  { to: '/owner', label: 'Painel', icon: '📊', end: true },
  { to: '/owner/agenda', label: 'Agenda', icon: '🗓️' },
  { to: '/owner/services', label: 'Serviços', icon: '✂️' },
  { to: '/owner/plans', label: 'Planos', icon: '🏷️' },
  { to: '/owner/subscriptions', label: 'Assinaturas', icon: '💳' },
  { to: '/owner/clients', label: 'Clientes', icon: '👥' },
  { to: '/owner/settings', label: 'Configurações', icon: '⚙️' },
]

export function OwnerLayout() {
  const { profile, logout } = useAuth()

  return (
    <div className="min-h-screen bg-ink text-neutral-100 md:flex">
      <aside className="hidden w-64 shrink-0 border-r border-ink-border bg-ink-soft md:flex md:flex-col">
        <div className="border-b border-ink-border px-5 py-5">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-gold/15 text-gold-light'
                    : 'text-neutral-400 hover:bg-ink-card hover:text-neutral-100',
                )
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-border p-3">
          <p className="truncate px-2 text-sm text-neutral-300">{profile?.name}</p>
          <button
            onClick={logout}
            className="mt-1 w-full rounded-lg px-2 py-2 text-left text-sm text-neutral-500 hover:bg-ink-card hover:text-red-400"
          >
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-border bg-ink-soft px-4 py-3 md:hidden">
          <Logo size="sm" />
          <NotificationBell />
        </header>
        <header className="hidden items-center justify-end border-b border-ink-border bg-ink-soft px-6 py-3 md:flex">
          <NotificationBell />
        </header>

        <EnablePush />

        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-8 md:pb-8">
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-ink-border bg-ink-soft/95 backdrop-blur md:hidden">
          {NAV.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]',
                  isActive ? 'text-gold-light' : 'text-neutral-500',
                )
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
