import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import clsx from 'clsx'
import { useBoot } from '@/hooks/useData'
import { CommandPalette, type Command } from '@web/components/CommandPalette'
import { TopBar } from '@web/components/TopNav'
import { MoreSheet } from '@web/components/MoreSheet'
import { Fab } from '@web/components/Fab'
import { buildNavGroups } from '@web/lib/nav'
import { QuickCreate } from '@web/components/QuickCreate'
import { FocusHost } from '@web/components/FocusHost'
import UpdateBanner from '@web/components/UpdateBanner'

// Content-type width: workspaces full-bleed, table/grid-heavy routes wide,
// feeds stay at the readable 6xl cap. Route-based because most pages don't
// render <Page> — the shell is the only place that always wraps content.
function mainWidth(path: string): string {
  if (path.startsWith('/project/') || path === '/projects') return ''
  if (path === '/' || path === '/review' || path === '/reports' ||
      path.startsWith('/reports/') || path.startsWith('/report/')) return 'max-w-7xl'
  return 'max-w-6xl'
}

export function AppShell() {
  const boot = useBoot()
  const { pathname } = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => { setMoreOpen(false) }, [pathname])

  // ⌘K palette; bare `c` quick-create (desktop bonuses, kept).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o) }
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey &&
          !/^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName) &&
          !(e.target as HTMLElement)?.isContentEditable) { e.preventDefault(); setQuickOpen(true) }
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
      <TopBar
        onOpenPalette={() => setPaletteOpen(true)}
        onQuickCreate={() => setQuickOpen(true)}
        onOpenMore={() => setMoreOpen(true)}
      />
      {/* Centered column that fits 2–3 card columns — soft-pop desktop-fit.
          (Replaces the former LOCKED full-width main — deliberate per redesign.) */}
      <main className={clsx('mx-auto w-full px-4 py-6 pb-28 lg:px-6', mainWidth(pathname))}>
        <Outlet />
      </main>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} navCommands={navCommands} />}
      <QuickCreate open={quickOpen} onClose={() => setQuickOpen(false)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <Fab />
      <FocusHost />
      <UpdateBanner />
    </div>
  )
}
