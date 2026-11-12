import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { Logo } from '../Logo'
import { NotificationBell } from '../NotificationBell'
import { ThemeToggle } from '../ThemeToggle'
import { EnablePush } from '../EnablePush'
import { useAuth } from '../../contexts/AuthContext'

interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/owner', label: 'Painel', icon: '📊', end: true },
  { to: '/owner/agenda', label: 'Agenda', icon: '🗓️' },
  { to: '/owner/holidays', label: 'Folgas e feriados', icon: '📅' },
  { to: '/owner/finance', label: 'Financeiro', icon: '💰' },
  { to: '/owner/services', label: 'Serviços', icon: '✂️' },
  { to: '/owner/plans', label: 'Planos', icon: '🏷️' },
  { to: '/owner/subscriptions', label: 'Assinaturas', icon: '💳' },
  { to: '/owner/clients', label: 'Clientes', icon: '👥' },
  { to: '/owner/team', label: 'Equipe', icon: '💈' },
  { to: '/owner/settings', label: 'Configurações', icon: '⚙️' },
]

/** No celular cabem 4 itens + "Mais"; o resto abre num painel. */
const MOBILE_MAIN = ['/owner', '/owner/agenda', '/owner/finance', '/owner/subscriptions']

/** Colaborador: só a área dele. */
const BARBER_NAV: NavItem[] = [
  { to: '/barber', label: 'Minha agenda', icon: '🗓️', end: true },
  { to: '/barber/clients', label: 'Meus clientes', icon: '👥' },
  { to: '/barber/production', label: 'Minha produção', icon: '💰' },
  { to: '/barber/schedule', label: 'Meus horários', icon: '⏰' },
  { to: '/barber/plans', label: 'Planos', icon: '🏷️' },
]
const BARBER_MAIN = ['/barber', '/barber/clients', '/barber/production', '/barber/schedule']

export function BarberLayout() {
  return <OwnerLayout nav={BARBER_NAV} mobileMain={BARBER_MAIN} />
}

export function OwnerLayout({ nav = NAV, mobileMain = MOBILE_MAIN }: { nav?: NavItem[]; mobileMain?: string[] } = {}) {
  const NAV = nav
  const { profile, logout } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const mainItems = NAV.filter((n) => mobileMain.includes(n.to))
  const moreItems = NAV.filter((n) => !mobileMain.includes(n.to))
  const moreActive = moreItems.some((n) => location.pathname.startsWith(n.to))

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
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        <header className="hidden items-center justify-end border-b border-ink-border bg-ink-soft px-6 py-3 md:flex">
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        <EnablePush />

        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-8 md:pb-8">
          <Outlet />
        </main>

        {moreOpen && (
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-ink-border bg-ink-soft p-3 pb-6"
              onClick={(e) => e.stopPropagation()}
            >
              {moreItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 rounded-md px-3 py-3 text-sm',
                      isActive ? 'bg-ink-card text-gold-light' : 'text-neutral-300',
                    )
                  }
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false)
                  logout()
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm text-neutral-400"
              >
                <span className="text-base">🚪</span>
                Sair
              </button>
            </div>
          </div>
        )}

        <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-ink-border bg-ink-soft/95 backdrop-blur md:hidden">
          {mainItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px]',
                  isActive ? 'text-gold-light' : 'text-neutral-500',
                )
              }
            >
              <span className="text-base">{item.icon}</span>
              <span className="w-full truncate text-center">{item.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={clsx(
              'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px]',
              moreActive || moreOpen ? 'text-gold-light' : 'text-neutral-500',
            )}
          >
            <span className="text-base">☰</span>
            <span className="w-full truncate text-center">Mais</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
