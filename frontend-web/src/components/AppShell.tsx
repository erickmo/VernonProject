import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Home, FolderKanban, CheckCircle2, User, Menu, X, Sun, Moon, Monitor, LogOut } from 'lucide-react'
import { useBoot, useDashboard } from '@/hooks/useData'
import { Avatar } from '@/components/ui'
import { logout } from '@/lib/api'
import { getStoredTheme, setTheme, type Theme } from '@/lib/theme'

const NAV = [
  { to: '/', label: 'Today', icon: Home, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, end: false },
  { to: '/review', label: 'Review', icon: CheckCircle2, end: false, badge: 'review' as const },
  { to: '/me', label: 'Me', icon: User, end: false },
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

  const pickTheme = (t: Theme) => { setTheme(t); setThemeState(t) }
  const doLogout = async () => { await logout(); window.location.href = '/web' }

  const sidebar = (
    <aside className="w-60 shrink-0 h-screen sticky top-0 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="px-5 py-5 flex items-center gap-2 text-brand-600 font-bold text-lg">
        <FolderKanban className="w-6 h-6" /> Vernon
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV.map(({ to, label, icon: Icon, end, badge }) => (
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
        ))}
      </nav>
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <Avatar name={boot.data?.full_name ?? '?'} image={boot.data?.image ?? undefined} size={32} />
          <span className="text-sm font-medium truncate">{boot.data?.full_name}</span>
        </div>
        <div className="flex items-center gap-1">
          {THEMES.map(({ value, icon: Icon }) => (
            <button
              key={value}
              onClick={() => pickTheme(value)}
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
          <div className="absolute left-0 top-0">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 h-14 px-4 lg:px-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <button className="lg:hidden" onClick={() => setDrawerOpen((o) => !o)}>
            {drawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div id="web-topbar-slot" className="flex-1 flex items-center justify-between" />
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 lg:px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
