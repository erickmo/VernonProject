import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Search, Plus, Coins, Sun, Moon, Monitor, LogOut, User, Grid3x3 } from 'lucide-react'
import clsx from 'clsx'
import { useBoot, useWallet, useDashboard } from '@/hooks/useData'
import { Avatar } from '@/components/ui'
import { logout } from '@/lib/api'
import { getStoredTheme, setTheme, type Theme } from '@/lib/theme'
import { formatNumber } from '@/lib/format'
import type { AvatarConfig } from '@/lib/types'
import { useModalA11y } from '@web/lib/useModalA11y'
import { NotificationBell } from '@web/components/NotificationBell'
import { NAV_PRIMARY } from '@web/lib/nav'

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
]

// Top tab bar (mobile-flow shell). Primary navigation lives here as a
// horizontal tab row (mirrors /m's BottomNav); everything else lives behind
// the More overlay. This bar also holds search / create / notifications /
// wallet / account actions.
export function TopBar({
  onOpenPalette, onQuickCreate, onOpenMore,
}: {
  onOpenPalette: () => void
  onQuickCreate: () => void
  onOpenMore: () => void
}) {
  const boot = useBoot()
  const wallet = useWallet()
  const { data: dash } = useDashboard()
  const reviewCount = dash?.counts.review ?? 0
  const { pathname } = useLocation()
  const [theme, setThemeState] = useState<Theme>(getStoredTheme())
  const b = boot.data
  const pickTheme = (t: Theme) => { setTheme(t); setThemeState(t) }
  const doLogout = async () => { try { await logout() } finally { window.location.href = '/w' } }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
        <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
          <NavLink to="/" className="mr-2 shrink-0 font-display text-lg font-semibold text-ink">Vernon</NavLink>
          {NAV_PRIMARY.map((t) => {
            const Icon = t.icon
            const badge = t.badge === 'review' ? reviewCount : 0
            const active = t.end ? pathname === t.to : pathname.startsWith(t.match ?? t.to)
            return (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-95',
                  active ? 'bg-brand-600 text-white shadow-sm' : 'text-muted hover:bg-hover/[0.04]',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{t.label}</span>
                {badge > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
            )
          })}
          <button onClick={onOpenMore} aria-label="More destinations"
            className="ml-1 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-muted hover:bg-hover/[0.04] active:scale-95">
            <Grid3x3 className="h-4 w-4" /> <span className="hidden md:inline">More</span>
          </button>
        </nav>

        <button onClick={onOpenPalette} aria-label="Search"
          className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:bg-hover/[0.04]">
          <Search className="h-4 w-4" />
          <span className="hidden md:inline">Search…</span>
          <kbd className="hidden rounded border border-line px-1.5 text-[10px] xl:inline-flex">⌘K</kbd>
        </button>
        <button onClick={onQuickCreate} aria-label="New"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 hover:shadow active:scale-[0.97]">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New</span>
        </button>
        <NotificationBell />
        <NavLink to="/wallet"
          className="hidden items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-sm font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 sm:flex">
          <Coins className="h-4 w-4" /> {wallet.data ? formatNumber(wallet.data.balance) : '—'}
        </NavLink>

        <AvatarMenu name={b?.full_name ?? '?'} image={b?.image ?? undefined} config={b?.avatar_config}
          theme={theme} pickTheme={pickTheme} onLogout={doLogout} />
      </div>
    </header>
  )
}

function AvatarMenu({
  name, image, config, theme, pickTheme, onLogout,
}: { name: string; image?: string; config?: AvatarConfig | null; theme: Theme; pickTheme: (t: Theme) => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useModalA11y(open, () => setOpen(false))
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Account" aria-haspopup="menu" aria-expanded={open} className="rounded-full">
        <Avatar name={name} image={image} config={config} size={30} />
      </button>
      {open && (
        <div ref={ref} role="menu" tabIndex={-1}
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-line bg-surface p-1.5 shadow-pop animate-fade-in">
          <div className="truncate px-2 py-1.5 text-sm font-medium text-ink">{name}</div>
          <NavLink to="/me" onClick={() => setOpen(false)} role="menuitem"
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted hover:bg-hover/[0.04]">
            <User className="h-4 w-4" /> My profile
          </NavLink>
          <div className="my-1.5 flex items-center gap-1 border-t border-line pt-1.5">
            {THEMES.map(({ value, icon: Icon, label }) => (
              <button key={value} onClick={() => pickTheme(value)} title={label} aria-pressed={theme === value}
                className={`flex-1 rounded-md py-1.5 ${theme === value ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/15' : 'text-muted hover:bg-hover/[0.04]'}`}>
                <Icon className="mx-auto h-4 w-4" />
              </button>
            ))}
          </div>
          <button onClick={onLogout} role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted hover:bg-hover/[0.04]">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}
