import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Search, Plus, Coins, Sun, Moon, Monitor, LogOut, User, Grid3x3, Maximize2, Timer, Keyboard } from 'lucide-react'
import clsx from 'clsx'
import { useBoot, useWallet, useDashboard, useFocusMode, useSaveMyProfile } from '@/hooks/useData'
import { Avatar } from '@/components/ui'
import { logout } from '@/lib/api'
import { getStoredTheme, setTheme, type Theme } from '@/lib/theme'
import { formatNumber } from '@/lib/format'
import type { AvatarConfig, FocusMode } from '@/lib/types'
import { useModalA11y } from '@web/lib/useModalA11y'
import { NotificationBell } from '@web/components/NotificationBell'
import { NAV_PRIMARY } from '@web/lib/nav'

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
]

const FOCUS_MODES: { value: FocusMode; icon: typeof Sun; label: string }[] = [
  { value: 'fullscreen', icon: Maximize2, label: 'Full screen' },
  { value: 'inline', icon: Timer, label: 'Timer only' },
]

// Top tab bar (mobile-flow shell). Primary navigation lives here as a
// horizontal tab row (mirrors /m's BottomNav); everything else lives behind
// the More overlay. This bar also holds search / create / notifications /
// wallet / account actions.
export function TopBar({
  onOpenPalette, onQuickCreate, onOpenMore, onOpenShortcuts,
}: {
  onOpenPalette: () => void
  onQuickCreate: () => void
  onOpenMore: () => void
  onOpenShortcuts: () => void
}) {
  const boot = useBoot()
  const wallet = useWallet()
  const { data: dash } = useDashboard()
  const reviewCount = dash?.counts.review ?? 0
  const { pathname } = useLocation()
  const [theme, setThemeState] = useState<Theme>(getStoredTheme())
  const b = boot.data
  const logo = b?.settings?.app_logo || ''
  const pickTheme = (t: Theme) => { setTheme(t); setThemeState(t) }
  const doLogout = async () => { try { await logout() } finally { window.location.href = '/w' } }

  return (
    <header className="sticky top-[var(--tk-h,0px)] z-20 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="relative flex min-h-[4.5rem] items-center gap-2 px-4 py-3 lg:px-6">
        <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar">
          <NavLink to="/" aria-label="Vernon home" className="group mr-2.5 flex shrink-0 items-center gap-2.5">
            {logo ? (
              <img src={logo} alt="Vernon" className="h-9 w-auto max-w-[160px] object-contain transition-transform duration-300 group-hover:scale-105" />
            ) : (
              <>
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-600 font-display text-base font-bold text-white transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">V</span>
                <span className="hidden font-display text-xl font-bold tracking-tight text-ink sm:inline">Vernon</span>
              </>
            )}
          </NavLink>
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
                  'relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-base font-semibold transition-all duration-200 active:scale-95',
                  active
                    ? 'bg-brand-600 text-white'
                    : 'text-muted hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/15 dark:hover:text-brand-300',
                )}
              >
                <Icon className={clsx('h-[1.15rem] w-[1.15rem] transition-transform', active && 'scale-110')} />
                <span className="hidden md:inline">{t.label}</span>
                {badge > 0 && (
                  <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold leading-none text-amber-950">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
            )
          })}
          <button onClick={onOpenMore} aria-label="More destinations" title="All destinations"
            className="ml-1 flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-base font-semibold text-muted transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 active:scale-95 dark:hover:bg-brand-500/15 dark:hover:text-brand-300">
            <Grid3x3 className="h-[1.15rem] w-[1.15rem]" /> <span className="hidden md:inline">More</span>
          </button>
        </nav>

        <button onClick={onOpenPalette} aria-label="Search"
          className="group flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-muted transition hover:bg-hover/[0.05] hover:text-ink">
          <Search className="h-4 w-4" />
          <span className="hidden md:inline">Search…</span>
          <kbd className="hidden rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted xl:inline-flex">⌘K</kbd>
        </button>
        {/* Discoverability hint for the `?` cheat-sheet — desktop-only (needs a physical keyboard). */}
        <button onClick={onOpenShortcuts} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (press ?)"
          className="hidden items-center gap-1.5 rounded-xl border border-line bg-canvas px-2.5 py-2 text-muted transition hover:bg-hover/[0.05] hover:text-ink lg:inline-flex">
          <Keyboard className="h-4 w-4" />
          <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted">?</kbd>
        </button>
        <button onClick={onQuickCreate} aria-label="New"
          className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-[0.97]">
          <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" /> <span className="hidden sm:inline">New</span>
        </button>
        <NotificationBell className="text-muted hover:bg-hover/[0.05]" />
        <NavLink to="/wallet"
          className="group hidden items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-2 text-sm font-bold text-ink transition hover:bg-hover/[0.05] sm:flex">
          <Coins className="h-4 w-4 text-amber-500 transition-transform group-hover:animate-wiggle" /> {wallet.data ? formatNumber(wallet.data.balance) : '—'}
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
  const focusMode = useFocusMode()
  const saveProfile = useSaveMyProfile()
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Account" aria-haspopup="menu" aria-expanded={open}
        className="rounded-full p-0.5 ring-1 ring-line transition hover:ring-brand-400 active:scale-95">
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
          <div className="px-2 pb-0.5 text-[11px] font-medium text-muted">Focus</div>
          <div className="mb-1.5 flex items-center gap-1">
            {FOCUS_MODES.map(({ value, icon: Icon, label }) => (
              <button key={value} onClick={() => saveProfile.mutate({ focus_mode: value })} title={label} aria-pressed={focusMode === value}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium ${focusMode === value ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/15' : 'text-muted hover:bg-hover/[0.04]'}`}>
                <Icon className="h-3.5 w-3.5" /> {label}
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
