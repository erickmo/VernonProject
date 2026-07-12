import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { useBoot } from '@/hooks/useData'
import { CommandPalette, type Command } from '@web/components/CommandPalette'
import { useCrumbs } from '@web/lib/crumbs'
import { TopBar } from '@web/components/TopNav'
import { Sidebar } from '@web/components/Sidebar'
import { buildNavGroups } from '@web/lib/nav'
import { QuickCreate } from '@web/components/QuickCreate'
import { FocusDock } from '@web/components/FocusDock'
import { FocusHost } from '@web/components/FocusHost'
import UpdateBanner from '@web/components/UpdateBanner'

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
  feedback: { label: 'Feedback', to: '/feedback' },
  'feedback-inbox': { label: 'Feedback', to: '/feedback-inbox' },
  reports: { label: 'Reports', to: '/reports' },
  report: { label: 'Reports', to: '/reports' },
  logbook: { label: 'Logbook', to: '/logbook' },
  leaderboard: { label: 'Leaderboard', to: '/leaderboard' },
  marketplace: { label: 'Marketplace', to: '/marketplace' },
  wallet: { label: 'Wallet', to: '/wallet' },
  'gift-points': { label: 'Send Points', to: '/gift-points' },
  users: { label: 'Users', to: '/users' },
  groups: { label: 'Groups', to: '/groups' },
  brands: { label: 'Brands', to: '/brands' },
  'gamification-settings': { label: 'Gamification Settings', to: '/gamification-settings' },
  'marketplace-admin': { label: 'Marketplace Admin', to: '/marketplace-admin' },
  'grant-points': { label: 'Send Points', to: '/grant-points' },
  'data-health': { label: 'Data Health', to: '/data-health' },
  settings: { label: 'Settings', to: '/settings' },
  me: { label: 'Me', to: '/me' },
  'attendance-report': { label: 'Attendance', to: '/attendance-report' },
  attendance: { label: 'Attendance', to: '/attendance-report' },
  'team-wall': { label: 'Team Wall', to: '/team-wall' },
  help: { label: 'Help', to: '/help' },
  achievements: { label: 'Achievements', to: '/achievements' },
  avatar: { label: 'Avatar', to: '/avatar' },
  'papan-iklan': { label: 'Papan Iklan', to: '/papan-iklan' },
  learn: { label: 'Learn', to: '/learn' },
  'learn-admin': { label: 'Manage Learning', to: '/learn-admin' },
}

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
  const { pathname } = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { crumbs: pageCrumbs } = useCrumbs()
  const crumbs = pageCrumbs ?? buildCrumbs(pathname)

  // Close the mobile drawer on route change.
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  // ⌘K / Ctrl+K toggles the command palette; bare `c` opens quick-create.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
      if (
        e.key === 'c' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !/^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName) &&
        !(e.target as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault()
        setQuickOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const b = boot.data
  const navCommands: Command[] = buildNavGroups(b).flatMap((g) =>
    g.to
      ? [{ id: g.to, label: g.label, group: g.label, icon: FolderKanban, to: g.to }]
      : g.leaves.map((l) => ({ id: l.to, label: l.label, group: g.label, icon: l.icon, to: l.to })),
  )

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {/* Content column, offset by the persistent sidebar width on lg+. */}
      <div className="lg:pl-60">
        <TopBar
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
          onQuickCreate={() => setQuickOpen(true)}
          crumbs={crumbs}
        />
        <main className="px-4 py-6 lg:px-6">
          {/* LOCKED: main area is full width on every route (product decision — do not re-add max-w). */}
          <div className="w-full"><Outlet /></div>
        </main>
      </div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} navCommands={navCommands} />}
      <QuickCreate open={quickOpen} onClose={() => setQuickOpen(false)} />
      <FocusDock />
      <FocusHost />
      <UpdateBanner />
    </div>
  )
}
