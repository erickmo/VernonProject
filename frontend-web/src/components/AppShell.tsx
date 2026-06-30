import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChevronRight, FolderKanban } from 'lucide-react'
import { useBoot } from '@/hooks/useData'
import { CommandPalette, type Command } from '@web/components/CommandPalette'
import { useCrumbs } from '@web/lib/crumbs'
import { TopNav } from '@web/components/TopNav'
import { buildNavGroups } from '@web/lib/nav'
import { QuickCreate } from '@web/components/QuickCreate'

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
  const { crumbs: pageCrumbs } = useCrumbs()
  const crumbs = pageCrumbs ?? buildCrumbs(pathname)

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
    <div className="min-h-screen bg-canvas text-ink font-sans">
      <TopNav onOpenPalette={() => setPaletteOpen(true)} onQuickCreate={() => setQuickOpen(true)} />
      {/* breadcrumb context bar */}
      <div className="sticky top-14 z-20 border-b border-line bg-canvas/85 px-4 lg:px-6 backdrop-blur">
        <nav aria-label="Breadcrumb" className="mx-auto flex h-9 max-w-5xl items-center gap-1.5 text-sm">
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-line" />}
              {c.to
                ? <NavLink to={c.to} className="truncate text-muted hover:text-ink">{c.label}</NavLink>
                : <span className="truncate font-medium text-ink">{c.label}</span>}
            </span>
          ))}
        </nav>
      </div>
      <main className="px-4 py-6 lg:px-6">
        <div className="mx-auto w-full max-w-5xl"><Outlet /></div>
      </main>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} navCommands={navCommands} />}
      <QuickCreate open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  )
}
