import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { FolderKanban, Search, Plus, Coins, Menu, X, Sun, Moon, Monitor, LogOut, User } from 'lucide-react'
import { useBoot, useDashboard, useWallet } from '@/hooks/useData'
import { Avatar } from '@/components/ui'
import { logout } from '@/lib/api'
import { getStoredTheme, setTheme, type Theme } from '@/lib/theme'
import { formatNumber } from '@/lib/format'
import type { AvatarConfig } from '@/lib/types'
import { useModalA11y } from '@web/lib/useModalA11y'
import { NotificationBell } from '@web/components/NotificationBell'
import { MegaMenu } from '@web/components/MegaMenu'
import { buildNavGroups } from '@web/lib/nav'

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
]

export function TopNav({ onOpenPalette, onQuickCreate }: { onOpenPalette: () => void; onQuickCreate: () => void }) {
  const boot = useBoot()
  const dash = useDashboard()
  const wallet = useWallet()
  const reviewCount = dash.data?.counts.review ?? 0
  const [theme, setThemeState] = useState<Theme>(getStoredTheme())
  const [sheet, setSheet] = useState(false)
  const sheetRef = useModalA11y(sheet, () => setSheet(false))
  const b = boot.data
  const groups = buildNavGroups(b)
  const pickTheme = (t: Theme) => { setTheme(t); setThemeState(t) }
  const doLogout = async () => { await logout(); window.location.href = '/w' }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
        {/* mobile hamburger */}
        <button className="lg:hidden -ml-1 p-1.5 text-muted" aria-label="Menu" aria-expanded={sheet}
          onClick={() => setSheet(true)}><Menu className="h-5 w-5" /></button>

        <NavLink to="/" className="flex items-center gap-2 font-semibold text-ink">
          <FolderKanban className="h-5 w-5 text-brand-600" /> <span className="hidden sm:inline">Vernon</span>
        </NavLink>

        {/* desktop mega menus */}
        <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
          {groups.map((g) => <MegaMenu key={g.id} group={g} reviewCount={reviewCount} />)}
        </nav>

        <div className="flex-1" />

        <button onClick={onOpenPalette}
          className="hidden items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:bg-hover/[0.04] sm:flex">
          <Search className="h-4 w-4" />
          <span className="hidden xl:inline">Search…</span>
          <kbd className="hidden xl:inline-flex rounded border border-line px-1.5 text-[10px]">⌘K</kbd>
        </button>
        <button onClick={onQuickCreate}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New</span>
        </button>
        <NotificationBell />
        <NavLink to="/wallet"
          className="hidden items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-sm font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 sm:flex">
          <Coins className="h-4 w-4" /> {wallet.data ? formatNumber(wallet.data.balance) : '—'}
        </NavLink>

        {/* avatar menu */}
        <AvatarMenu name={b?.full_name ?? '?'} image={b?.image ?? undefined} config={b?.avatar_config}
          theme={theme} pickTheme={pickTheme} onLogout={doLogout} />
      </div>

      {/* mobile full-screen sheet */}
      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSheet(false)} />
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-label="Navigation" tabIndex={-1}
            className="absolute inset-y-0 left-0 w-[min(86vw,20rem)] overflow-y-auto bg-canvas p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold text-ink"><FolderKanban className="h-5 w-5 text-brand-600" /> Vernon</span>
              <button onClick={() => setSheet(false)} className="p-1.5 text-muted"><X className="h-5 w-5" /></button>
            </div>
            {groups.map((g) => (
              <div key={g.id} className="mb-3">
                <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.label}</div>
                {(g.to ? [{ to: g.to, label: g.label, sub: '', icon: FolderKanban }] : g.leaves).map((l) => {
                  const Icon = l.icon
                  return (
                    <NavLink key={l.to} to={l.to} end={(l as { end?: boolean }).end} onClick={() => setSheet(false)}
                      className={({ isActive }) => `flex items-center gap-3 rounded-md px-2 py-2 text-sm ${isActive ? 'bg-brand-50 dark:bg-brand-500/10 text-ink' : 'text-muted hover:bg-hover/[0.04]'}`}>
                      <Icon className="h-4 w-4" /> {l.label}
                    </NavLink>
                  )
                })}
              </div>
            ))}
            <div className="mt-4 flex items-center gap-1 border-t border-line pt-3">
              {THEMES.map(({ value, icon: Icon, label }) => (
                <button key={value} onClick={() => pickTheme(value)} title={label} aria-pressed={theme === value}
                  className={`flex-1 rounded-md py-1.5 ${theme === value ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/15' : 'text-muted hover:bg-hover/[0.04]'}`}>
                  <Icon className="mx-auto h-4 w-4" />
                </button>
              ))}
            </div>
            <button onClick={doLogout} className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted hover:bg-hover/[0.04]">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>
      )}
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
      <button onClick={() => setOpen((o) => !o)} aria-label="Account" className="rounded-full">
        <Avatar name={name} image={image} config={config} size={30} />
      </button>
      {open && (
        <div ref={ref} role="menu" tabIndex={-1}
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-line bg-surface p-1.5 shadow-pop animate-fade-in">
          <div className="px-2 py-1.5 text-sm font-medium text-ink truncate">{name}</div>
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
