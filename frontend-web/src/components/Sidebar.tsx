import { NavLink, useLocation } from 'react-router-dom'
import { FolderKanban, X } from 'lucide-react'
import clsx from 'clsx'
import { useBoot, useDashboard } from '@/hooks/useData'
import { buildNavGroups, NAV_PRIMARY, NAV_PRIMARY_PATHS, type NavLeaf } from '@web/lib/nav'

// Persistent left sidebar (lg+) / slide-in drawer (below lg). Mirrors the mobile
// app's information architecture: the 5 primary tabs pinned at top, then the same
// grouped sections (Work / Community / Points / Admin / Attendance) below.
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const boot = useBoot()
  const dash = useDashboard()
  const reviewCount = dash.data?.counts.review ?? 0
  const { pathname } = useLocation()
  const groups = buildNavGroups(boot.data)

  const isActive = (l: NavLeaf) => (l.end ? pathname === l.to : pathname.startsWith(l.match ?? l.to))

  const Row = ({ l }: { l: NavLeaf }) => {
    const Icon = l.icon
    const active = isActive(l)
    const badge = l.badge === 'review' ? reviewCount : 0
    return (
      <NavLink
        to={l.to}
        onClick={onClose}
        className={clsx(
          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
          active
            ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
            : 'text-muted hover:bg-hover/[0.05] hover:text-ink',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.4 : 2} />
        <span className="flex-1 truncate">{l.label}</span>
        {badge > 0 && (
          <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </NavLink>
    )
  }

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <NavLink to="/" onClick={onClose} className="flex items-center gap-2 font-display text-[15px] font-bold tracking-tight text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <FolderKanban className="h-4 w-4" />
          </span>
          Vernon
        </NavLink>
        <button className="ml-auto p-1.5 text-muted lg:hidden" onClick={onClose} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-6 no-scrollbar" aria-label="Main navigation">
        {NAV_PRIMARY.map((l) => <Row key={l.to} l={l} />)}

        {groups.map((g) => {
          // A plain-link group whose target is a pinned primary (Reports) is
          // already represented above — skip it here.
          if (g.to && NAV_PRIMARY_PATHS.has(g.to)) return null
          const leaves = (g.to
            ? [{ to: g.to, label: g.label, sub: '', icon: FolderKanban } as NavLeaf]
            : g.leaves
          ).filter((l) => !NAV_PRIMARY_PATHS.has(l.to))
          if (leaves.length === 0) return null
          return (
            <div key={g.id} className="pt-4">
              <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.label}</div>
              <div className="space-y-0.5">
                {leaves.map((l) => <Row key={l.to} l={l} />)}
              </div>
            </div>
          )
        })}
      </nav>
    </div>
  )

  return (
    <>
      {/* Desktop: persistent rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        {content}
      </aside>

      {/* Mobile: slide-in drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
          <div className="absolute inset-y-0 left-0 w-[min(84vw,17rem)] border-r border-line bg-surface shadow-pop">
            {content}
          </div>
        </div>
      )}
    </>
  )
}
