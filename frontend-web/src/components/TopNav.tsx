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
  const logo = b?.settings?.app_logo || ''
  const pickTheme = (t: Theme) => { setTheme(t); setThemeState(t) }
  const doLogout = async () => { try { await logout() } finally { window.location.href = '/w' } }

  return (
    <header className="sticky top-0 z-20 bg-gradient-to-br from-indigo-700 via-violet-600 to-indigo-600 shadow-[0_10px_30px_-10px_rgb(79_70_229/0.55),0_2px_6px_-3px_rgb(0_0_0/0.25)] ring-1 ring-black/10">
      {/* slow ambient light sweep — clipped to the bar so it never bleeds onto dropdowns */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-sheen" />
      </span>
      {/* top bevel highlight — raised 3D edge */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      {/* signature hairline along the bottom edge */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-black/15" />
      <div className="relative flex min-h-[4.5rem] items-center gap-2 px-4 py-3 lg:px-6">
        <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar">
          <NavLink to="/" aria-label="Vernon home" className="group mr-2.5 flex shrink-0 items-center gap-2.5">
            {logo ? (
              <img src={logo} alt="Vernon" className="h-9 w-auto max-w-[160px] object-contain drop-shadow-[0_2px_4px_rgb(0_0_0/0.25)] transition-transform duration-300 group-hover:scale-105" />
            ) : (
              <>
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white font-display text-base font-bold text-brand-600 shadow-[0_4px_12px_-2px_rgb(0_0_0/0.35),inset_0_1px_0_rgb(255_255_255/0.6)] ring-1 ring-inset ring-white/50 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">V</span>
                <span className="hidden font-display text-xl font-bold tracking-tight text-white drop-shadow-sm sm:inline">Vernon</span>
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
                    ? 'bg-white text-brand-700 shadow-[0_4px_14px_-3px_rgb(0_0_0/0.35),inset_0_1px_0_rgb(255_255_255/0.6)] ring-1 ring-inset ring-white/50'
                    : 'text-white/85 hover:bg-white/15 hover:text-white',
                )}
              >
                <Icon className={clsx('h-[1.15rem] w-[1.15rem] transition-transform', active && 'scale-110')} />
                <span className="hidden md:inline">{t.label}</span>
                {badge > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white/60">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
            )
          })}
          <button onClick={onOpenMore} aria-label="More destinations"
            className="ml-1 flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-base font-semibold text-white/85 transition-all hover:bg-white/15 hover:text-white active:scale-95">
            <Grid3x3 className="h-[1.15rem] w-[1.15rem]" /> <span className="hidden md:inline">More</span>
          </button>
        </nav>

        <button onClick={onOpenPalette} aria-label="Search"
          className="group flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/80 shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] transition hover:bg-white/20 hover:text-white">
          <Search className="h-4 w-4" />
          <span className="hidden md:inline">Search…</span>
          <kbd className="hidden rounded-md border border-white/40 bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white xl:inline-flex">⌘K</kbd>
        </button>
        <button onClick={onQuickCreate} aria-label="New"
          className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-brand-700 shadow-[0_4px_14px_-2px_rgb(0_0_0/0.35),inset_0_1px_0_rgb(255_255_255/0.6)] ring-1 ring-inset ring-white/50 transition hover:shadow-[0_6px_20px_-2px_rgb(0_0_0/0.4)] active:scale-[0.97]">
          {/* sheen sweep on hover */}
          <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-brand-500/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" /> <span className="hidden sm:inline">New</span>
        </button>
        <NotificationBell className="text-white/85 hover:bg-white/15" />
        <NavLink to="/wallet"
          className="group hidden items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white/90 shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] ring-1 ring-inset ring-white/20 transition hover:bg-white/20 hover:text-white sm:flex">
          <Coins className="h-4 w-4 text-amber-300 transition-transform group-hover:animate-wiggle" /> {wallet.data ? formatNumber(wallet.data.balance) : '—'}
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
      <button onClick={() => setOpen((o) => !o)} aria-label="Account" aria-haspopup="menu" aria-expanded={open}
        className="rounded-full p-0.5 ring-2 ring-white/70 ring-offset-1 ring-offset-transparent transition hover:ring-white active:scale-95">
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
