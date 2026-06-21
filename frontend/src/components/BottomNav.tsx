import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { Home, FolderKanban, CheckCheck, BarChart3, User } from 'lucide-react'
import { useDashboard } from '@/hooks/useData'

const TABS = [
  { to: '/', label: 'Today', icon: Home, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, end: false },
  { to: '/review', label: 'Review', icon: CheckCheck, end: false, badgeKey: 'review' },
  { to: '/reports', label: 'Reports', icon: BarChart3, end: false },
  { to: '/me', label: 'Me', icon: User, end: false },
] as const

export function BottomNav() {
  const { data } = useDashboard()
  const reviewCount = data?.counts.review ?? 0

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-800/95 shadow-nav backdrop-blur pb-safe">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map((t) => {
          const Icon = t.icon
          const badge = 'badgeKey' in t && t.badgeKey === 'review' ? reviewCount : 0
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                clsx(
                  'relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-brand-600' : 'text-slate-400 dark:text-slate-500',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <Icon className="h-6 w-6" strokeWidth={isActive ? 2.4 : 2} />
                    {badge > 0 && (
                      <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  {t.label}
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
