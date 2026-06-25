import type { ReactNode } from 'react'

/**
 * Two-column page layout: a flexible main column plus a fixed-width rail that
 * drops below the main content on narrow screens. The rail is for secondary
 * content — previews, summaries, danger zones, related lists — so the main
 * column never has to stretch a single field/line across the whole viewport.
 */
export function PageGrid({
  main,
  rail,
  railFirst = false,
}: {
  main: ReactNode
  rail: ReactNode
  /** Show the rail above main on mobile (e.g. a summary that should lead). */
  railFirst?: boolean
}) {
  // No rail content → main spans the full width rather than leaving a dead column.
  if (!rail) return <div className="min-w-0 space-y-6">{main}</div>
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className={`min-w-0 space-y-6 ${railFirst ? 'order-2 xl:order-1' : ''}`}>{main}</div>
      <aside className={`space-y-6 ${railFirst ? 'order-1 xl:order-2' : ''}`}>{rail}</aside>
    </div>
  )
}

/**
 * Responsive field grid for forms: two columns on >=sm, one on mobile. A field
 * that should span the full row gets `className="sm:col-span-2"` (e.g. a
 * description textarea). Use inside a SectionCard.
 */
export function FieldGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${className}`}>{children}</div>
}

/**
 * Standard surface card with an optional header (title/subtitle + actions).
 * Replaces the repeated inline `rounded-2xl bg-white shadow-card p-6` pattern.
 */
export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`rounded-2xl bg-white dark:bg-slate-900 shadow-card p-5 sm:p-6 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h2>}
            {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
