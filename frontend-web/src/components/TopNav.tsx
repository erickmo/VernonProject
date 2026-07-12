import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Search, Plus, Coins, Menu, ChevronRight, Sun, Moon, Monitor, LogOut, User } from 'lucide-react'
import { useBoot, useWallet } from '@/hooks/useData'
import { Avatar } from '@/components/ui'
import { logout } from '@/lib/api'
import { getStoredTheme, setTheme, type Theme } from '@/lib/theme'
import { formatNumber } from '@/lib/format'
import type { AvatarConfig } from '@/lib/types'
import { useModalA11y } from '@web/lib/useModalA11y'
import { NotificationBell } from '@web/components/NotificationBell'

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
]

// Slim top bar inside the sidebar-offset content column. Primary navigation
// lives in the Sidebar; this bar holds the breadcrumb + search / create /
// notifications / wallet / account actions, and the mobile menu trigger.
export function TopBar({
  onOpenSidebar, onOpenPalette, onQuickCreate, crumbs,
}: {
  onOpenSidebar: () => void
  onOpenPalette: () => void
  onQuickCreate: () => void
  crumbs: { label: string; to?: string }[]
}) {
  const boot = useBoot()
  const wallet = useWallet()
  const [theme, setThemeState] = useState<Theme>(getStoredTheme())
  const b = boot.data
  const pickTheme = (t: Theme) => { setTheme(t); setThemeState(t) }
  const doLogout = async () => { try { await logout() } finally { window.location.href = '/w' } }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
        <button className="-ml-1 p-1.5 text-muted lg:hidden" aria-label="Open menu" onClick={onOpenSidebar}>
          <Menu className="h-5 w-5" />
        </button>

        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-line" />}
              {c.to
                ? <NavLink to={c.to} className="truncate text-muted hover:text-ink">{c.label}</NavLink>
                : <span className="truncate font-medium text-ink">{c.label}</span>}
            </span>
          ))}
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
