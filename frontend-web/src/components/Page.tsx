import type { ReactNode, ComponentType } from 'react'
import clsx from 'clsx'

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  // Full width within the shell column; AppShell's route→width map owns the
  // outer cap (feed 6xl / wide 7xl / full). Narrow pages pass their own max-w.
  return <div className={clsx('w-full animate-rise', className)}>{children}</div>
}

export function PageHeader({
  icon: Icon, emoji, title, subtitle, actions, children,
}: {
  icon?: ComponentType<{ className?: string }>; emoji?: string
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode
}) {
  return (
    <header className="mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {emoji && <span className="text-2xl leading-none">{emoji}</span>}
          {Icon && <Icon className="h-6 w-6 shrink-0 text-muted" />}
          <h1 className="truncate text-[1.85rem] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      {children}
    </header>
  )
}

export function Section({
  title, actions, divider = true, children, className,
}: {
  title?: ReactNode; actions?: ReactNode; divider?: boolean; children: ReactNode; className?: string
}) {
  return (
    <section className={clsx('py-5', divider && 'border-t border-line', className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">{title}</h2>}
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

// Stagger entrance for card feeds: spread onto each item's wrapper div.
// Delay caps at item 8 so long feeds don't crawl in.
export const rise = (i: number) => ({
  className: 'animate-rise',
  style: { animationDelay: `${Math.min(i, 8) * 40}ms` },
})
