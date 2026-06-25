import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Home, CalendarDays, FolderKanban, CheckCircle2, Menu, X, Sun, Moon, Monitor, LogOut,
  Trophy, ShoppingBag, Wallet, Gift, BarChart3, Users as UsersIcon, Layers, Tag,
  Award, Store, Coins,
} from 'lucide-react'
import {
  useBoot, useDashboard,
  canManageGroups, canManageBrands, canManageUsers, canManageBadges,
  canManageMarketplace, canGrantPoints,
} from '@/hooks/useData'
import { Avatar } from '@/components/ui'
import { logout } from '@/lib/api'
import { getStoredTheme, setTheme, type Theme } from '@/lib/theme'
import { useModalA11y } from '@web/lib/useModalA11y'

const THEME_LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'System' }

type NavItem = {
  to: string
  label: string
  icon: typeof Home
  end?: boolean
  badge?: 'review'
}

const MAIN: NavItem[] = [
  { to: '/', label: 'Today', icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/review', label: 'Review', icon: CheckCircle2, badge: 'review' },
]

const REWARDS: NavItem[] = [
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/marketplace', label: 'Marketplace', icon: ShoppingBag },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/gift-points', label: 'Gift Points', icon: Gift },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
]

const THEMES: { value: Theme; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun }, { value: 'dark', icon: Moon }, { value: 'system', icon: Monitor },
]

export function AppShell() {
  const boot = useBoot()
  const dash = useDashboard()
  const reviewCount = dash.data?.counts.review ?? 0
  const [theme, setThemeState] = useState<Theme>(getStoredTheme())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useModalA11y(drawerOpen, () => setDrawerOpen(false))

  const pickTheme = (t: Theme) => { setTheme(t); setThemeState(t) }
  const doLogout = async () => { await logout(); window.location.href = '/w' }

  const b = boot.data
  const admin: NavItem[] = [
    ...(canManageUsers(b) ? [{ to: '/users', label: 'Users', icon: UsersIcon } as NavItem] : []),
    ...(canManageGroups(b) ? [{ to: '/groups', label: 'Groups', icon: Layers } as NavItem] : []),
    ...(canManageBrands(b) ? [{ to: '/brands', label: 'Brands', icon: Tag } as NavItem] : []),
    ...(canManageBadges(b) ? [{ to: '/badge-settings', label: 'Badges', icon: Award } as NavItem] : []),
    ...(canManageMarketplace(b) ? [{ to: '/marketplace-admin', label: 'Marketplace Admin', icon: Store } as NavItem] : []),
    ...(canGrantPoints(b) ? [{ to: '/grant-points', label: 'Grant Points', icon: Coins } as NavItem] : []),
  ]

  const renderItem = ({ to, label, icon: Icon, end, badge }: NavItem) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={() => setDrawerOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
          isActive
            ? 'bg-brand-50 dark:bg-brand-600/15 text-brand-600 dark:text-brand-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`
      }
    >
      <Icon className="w-5 h-5" />
      <span className="flex-1">{label}</span>
      {badge === 'review' && reviewCount > 0 && (
        <span className="text-xs font-semibold bg-brand-600 text-white rounded-full px-2 py-0.5">{reviewCount}</span>
      )}
    </NavLink>
  )

  const sectionLabel = (text: string) => (
    <div className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
      {text}
    </div>
  )

  const sidebar = (
    <aside className="w-60 shrink-0 h-screen sticky top-0 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="px-5 py-5 flex items-center gap-2 text-brand-600 font-bold text-lg">
        <FolderKanban className="w-6 h-6" /> Vernon
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {MAIN.map(renderItem)}
        {sectionLabel('Rewards')}
        {REWARDS.map(renderItem)}
        {admin.length > 0 && (
          <>
            {sectionLabel('Admin')}
            {admin.map(renderItem)}
          </>
        )}
      </nav>
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <NavLink
          to="/me"
          onClick={() => setDrawerOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-2 px-1 py-1 rounded-lg ${isActive ? 'text-brand-600' : ''}`
          }
        >
          <Avatar name={b?.full_name ?? '?'} image={b?.image ?? undefined} size={32} />
          <span className="text-sm font-medium truncate">{b?.full_name}</span>
        </NavLink>
        <div className="flex items-center gap-1">
          {THEMES.map(({ value, icon: Icon }) => (
            <button
              key={value}
              onClick={() => pickTheme(value)}
              aria-label={`${THEME_LABEL[value]} theme`}
              aria-pressed={theme === value}
              title={THEME_LABEL[value]}
              className={`flex-1 flex items-center justify-center py-1.5 rounded-md ${
                theme === value ? 'bg-brand-50 dark:bg-brand-600/15 text-brand-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <button onClick={doLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* desktop sidebar */}
      <div className="hidden lg:block">{sidebar}</div>

      {/* mobile/tablet drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-label="Navigation" tabIndex={-1} className="absolute left-0 top-0">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* mobile-only top bar (desktop uses the sidebar) */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <button
            className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((o) => !o)}
          >
            {drawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="flex items-center gap-2 text-brand-600 font-bold">
            <FolderKanban className="w-5 h-5" /> Vernon
          </span>
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 lg:px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
