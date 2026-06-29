import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Home, CalendarDays, FolderKanban, CheckCircle2, Menu, X, Sun, Moon, Monitor, LogOut,
  Trophy, ShoppingBag, Wallet, Gift, BarChart3, Users as UsersIcon, Layers, Tag,
  Store, Coins, ChevronRight, Search, ShieldAlert, Settings as SettingsIcon, Video,
  StickyNote, MessageSquarePlus, Inbox, QrCode, UserCheck, Zap, UsersRound,
} from 'lucide-react'
import {
  useBoot, useDashboard, useWallet,
  canManageGroups, canManageBrands, canManageUsers, canManageBadges,
  canManageMarketplace, canGrantPoints, canManageAttendance,
} from '@/hooks/useData'
import { Avatar } from '@/components/ui'
import { logout } from '@/lib/api'
import { getStoredTheme, setTheme, type Theme } from '@/lib/theme'
import { useModalA11y } from '@web/lib/useModalA11y'
import { formatNumber } from '@/lib/format'
import { CommandPalette, type Command } from '@web/components/CommandPalette'
import { NotificationBell } from '@web/components/NotificationBell'
import type { Accent } from '@web/components/bento'
import { useCrumbs } from '@web/lib/crumbs'

const THEME_LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'System' }

// Domain accent per nav route — matches the bento page accents.
function accentFor(to: string): Accent {
  if (to === '/leaderboard') return 'violet'
  if (to === '/team-wall') return 'violet'
  if (to === '/gamification-settings') return 'amber'
  if (to === '/marketplace' || to === '/marketplace-admin') return 'emerald'
  if (to === '/wallet' || to === '/gift-points' || to === '/grant-points') return 'amber'
  if (to === '/users') return 'rose'
  if (to === '/projects' || to.startsWith('/project')) return 'sky'
  if (to === '/groups' || to === '/brands' || to === '/reports') return 'slate'
  return 'brand' // Today, Calendar, Review, Me
}

const ACTIVE_PILL: Record<Accent, string> = {
  brand:   'bg-brand-50 dark:bg-brand-600/15 text-brand-600 dark:text-brand-300',
  amber:   'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  violet:  'bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300',
  sky:     'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rose:    'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
  slate:   'bg-slate-100 dark:bg-slate-700/40 text-slate-700 dark:text-slate-200',
}

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
  { to: '/meetings', label: 'Meetings', icon: Video },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/feedback', label: 'Send feedback', icon: MessageSquarePlus },
  { to: '/review', label: 'Review', icon: CheckCircle2, badge: 'review' },
]

const REWARDS: NavItem[] = [
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/team-wall', label: 'Team Wall', icon: UsersRound },
  { to: '/marketplace', label: 'Marketplace', icon: ShoppingBag },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/gift-points', label: 'Gift Points', icon: Gift },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
]

const THEMES: { value: Theme; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun }, { value: 'dark', icon: Moon }, { value: 'system', icon: Monitor },
]

const SECTION: Record<string, { label: string; to: string }> = {
  '': { label: 'Today', to: '/' },
  calendar: { label: 'Calendar', to: '/calendar' },
  projects: { label: 'Projects', to: '/projects' },
  project: { label: 'Projects', to: '/projects' },
  'project-detail': { label: 'Projects', to: '/projects' },
  'project-item': { label: 'Projects', to: '/projects' },
  review: { label: 'Review', to: '/review' },
  meetings: { label: 'Meetings', to: '/meetings' },
  notes: { label: 'Notes', to: '/notes' },
  feedback: { label: 'Send feedback', to: '/feedback' },
  'feedback-inbox': { label: 'Feedback', to: '/feedback-inbox' },
  reports: { label: 'Reports', to: '/reports' },
  report: { label: 'Reports', to: '/reports' },
  leaderboard: { label: 'Leaderboard', to: '/leaderboard' },
  marketplace: { label: 'Marketplace', to: '/marketplace' },
  wallet: { label: 'Wallet', to: '/wallet' },
  'gift-points': { label: 'Gift Points', to: '/gift-points' },
  users: { label: 'Users', to: '/users' },
  groups: { label: 'Groups', to: '/groups' },
  brands: { label: 'Brands', to: '/brands' },
  'gamification-settings': { label: 'Gamification Settings', to: '/gamification-settings' },
  'marketplace-admin': { label: 'Marketplace Admin', to: '/marketplace-admin' },
  'grant-points': { label: 'Grant Points', to: '/grant-points' },
  'data-health': { label: 'Data Health', to: '/data-health' },
  settings: { label: 'Settings', to: '/settings' },
  me: { label: 'Me', to: '/me' },
  'attendance-report': { label: 'Attendance', to: '/attendance-report' },
  attendance: { label: 'Attendance', to: '/attendance-report' },
}

// Breadcrumb for the desktop header: a clickable section crumb, plus a
// non-clickable leaf for nested routes (e.g. "Projects / Detail").
function buildCrumbs(pathname: string): { label: string; to?: string }[] {
  const segs = pathname.split('/').filter(Boolean)
  const top = segs[0] ?? ''
  const section = SECTION[top] ?? { label: 'Vernon', to: '/' }
  const rest = segs.slice(1)
  if (rest.length === 0) return [{ label: section.label }]
  let leaf = 'Detail'
  if (rest.includes('new')) leaf = 'New'
  else if (rest.includes('item') || top === 'project-item') leaf = 'Item'
  else if (['users', 'groups', 'brands', 'marketplace-admin', 'notes'].includes(top)) leaf = 'Edit'
  return [{ label: section.label, to: section.to }, { label: leaf }]
}

export function AppShell() {
  const boot = useBoot()
  const dash = useDashboard()
  const reviewCount = dash.data?.counts.review ?? 0
  const [theme, setThemeState] = useState<Theme>(getStoredTheme())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useModalA11y(drawerOpen, () => setDrawerOpen(false))
  const wallet = useWallet()
  const { pathname } = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { crumbs: pageCrumbs } = useCrumbs()
  const crumbs = pageCrumbs ?? buildCrumbs(pathname)

  // ⌘K / Ctrl+K toggles the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const pickTheme = (t: Theme) => { setTheme(t); setThemeState(t) }
  const doLogout = async () => { await logout(); window.location.href = '/w' }

  const b = boot.data
  const admin: NavItem[] = [
    ...(canManageUsers(b) ? [{ to: '/users', label: 'Users', icon: UsersIcon } as NavItem] : []),
    ...(canManageUsers(b) ? [{ to: '/feedback-inbox', label: 'Feedback', icon: Inbox } as NavItem] : []),
    ...(canManageGroups(b) ? [{ to: '/groups', label: 'Groups', icon: Layers } as NavItem] : []),
    ...(canManageGroups(b) ? [{ to: '/data-health', label: 'Data Health', icon: ShieldAlert } as NavItem] : []),
    ...(canManageGroups(b) ? [{ to: '/settings', label: 'Settings', icon: SettingsIcon } as NavItem] : []),
    ...(canManageBrands(b) ? [{ to: '/brands', label: 'Brands', icon: Tag } as NavItem] : []),
    ...(canManageBadges(b) ? [{ to: '/gamification-settings', label: 'Gamification Settings', icon: Zap } as NavItem] : []),
    ...(canManageMarketplace(b) ? [{ to: '/marketplace-admin', label: 'Marketplace Admin', icon: Store } as NavItem] : []),
    ...(canGrantPoints(b) ? [{ to: '/grant-points', label: 'Grant Points', icon: Coins } as NavItem] : []),
    ...(canManageAttendance(b) ? [{ to: '/attendance-report', label: 'Attendance', icon: QrCode } as NavItem] : []),
    ...(canManageAttendance(b) ? [{ to: '/attendance/schedules', label: 'Schedules', icon: CalendarDays } as NavItem] : []),
    ...(canManageAttendance(b) ? [{ to: '/attendance/stations', label: 'Stations', icon: Monitor } as NavItem] : []),
    ...(canManageAttendance(b) ? [{ to: '/attendance/exceptions', label: 'Leave/WFH', icon: Inbox } as NavItem] : []),
    ...(canManageAttendance(b) ? [{ to: '/attendance/holidays', label: 'Holidays', icon: CalendarDays } as NavItem] : []),
    ...(canManageAttendance(b) ? [{ to: '/attendance/profiles', label: 'Enrolled', icon: UserCheck } as NavItem] : []),
  ]

  const navCommands: Command[] = [
    ...MAIN.map((n) => ({ id: n.to, label: n.label, group: 'Go to', icon: n.icon, to: n.to })),
    ...REWARDS.map((n) => ({ id: n.to, label: n.label, group: 'Rewards', icon: n.icon, to: n.to })),
    ...admin.map((n) => ({ id: n.to, label: n.label, group: 'Admin', icon: n.icon, to: n.to })),
  ]

  const renderItem = ({ to, label, icon: Icon, end, badge }: NavItem) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={() => setDrawerOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium ${
          isActive
            ? ACTIVE_PILL[accentFor(to)]
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
          <div className="flex-1" />
          <NotificationBell />
        </header>
        {/* desktop header — breadcrumb + global search + points (mobile uses its own bar above) */}
        <header className="hidden lg:flex sticky top-0 z-30 items-center gap-4 h-14 px-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5 min-w-0">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-300 dark:text-slate-600" />}
                {c.to ? (
                  <NavLink to={c.to} className="truncate text-slate-500 hover:text-brand-600">{c.label}</NavLink>
                ) : (
                  <span className="truncate font-semibold text-slate-800 dark:text-slate-100">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
          <div className="flex-1" />
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Search className="w-4 h-4" />
            <span className="hidden xl:inline">Search…</span>
            <kbd className="hidden xl:inline-flex items-center rounded border border-slate-200 dark:border-slate-700 px-1.5 text-[10px] font-medium">⌘K</kbd>
          </button>
          <NotificationBell />
          <NavLink
            to="/wallet"
            className="flex items-center gap-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 px-3 py-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300"
          >
            <Coins className="w-4 h-4" />
            {wallet.data ? formatNumber(wallet.data.balance) : '—'}
          </NavLink>
        </header>
        <main className="flex-1 w-full px-4 lg:px-8 2xl:px-10 py-6">
          <Outlet />
        </main>
      </div>

      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} navCommands={navCommands} />
      )}
    </div>
  )
}
