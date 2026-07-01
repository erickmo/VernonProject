import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import type { NavGroup } from '@web/lib/nav'

export function MegaMenu({
  group, reviewCount, onNavigate,
}: { group: NavGroup; reviewCount: number; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const closeT = useRef<number>()
  const { pathname } = useLocation()

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  // Plain-link group (e.g. Reports): no dropdown.
  if (group.to) {
    return (
      <NavLink
        to={group.to}
        onClick={onNavigate}
        className={({ isActive }) => clsx(
          'rounded-md px-3 py-1.5 text-sm font-medium',
          isActive ? 'text-ink' : 'text-muted hover:text-ink hover:bg-hover/[0.04]',
        )}
      >
        {group.label}
      </NavLink>
    )
  }

  const leafActive = (l: (typeof group.leaves)[number]) =>
    l.end ? pathname === l.to : pathname.startsWith(l.match ?? l.to)
  const groupActive = group.leaves.some(leafActive)
  // ponytail: hover-intent open/close via 150ms debounce; closeT cleared on unmount via useEffect below
  const open$ = () => { window.clearTimeout(closeT.current); setOpen(true) }
  const close$ = () => { closeT.current = window.setTimeout(() => setOpen(false), 150) }

  useEffect(() => () => { window.clearTimeout(closeT.current) }, [])

  return (
    <div ref={wrapRef} className="relative" onMouseEnter={open$} onMouseLeave={close$}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={clsx(
          'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium',
          groupActive ? 'text-ink' : 'text-muted hover:text-ink hover:bg-hover/[0.04]',
        )}
      >
        {group.label}
        <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[34rem] rounded-lg border border-line bg-surface p-2 shadow-pop animate-fade-in">
          <div className="grid grid-cols-2 gap-1">
            {group.leaves.map((l) => {
              const Icon = l.icon
              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={() => { setOpen(false); onNavigate?.() }}
                  className={({ isActive }) => clsx(
                    'flex items-start gap-2.5 rounded-md p-2.5',
                    (l.match ? leafActive(l) : isActive) ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-hover/[0.04]',
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {l.label}
                      {l.badge === 'review' && reviewCount > 0 && (
                        <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">{reviewCount}</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">{l.sub}</span>
                  </span>
                </NavLink>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
