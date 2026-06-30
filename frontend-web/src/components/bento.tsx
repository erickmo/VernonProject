import type { ReactNode, ComponentType } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'

export type Accent = 'brand' | 'amber' | 'violet' | 'sky' | 'emerald' | 'rose' | 'slate'
export type Tone = 'plain' | 'tint' | 'gradient' | 'solid'
export type Span = 'sm' | 'md' | 'lg' | 'wide' | 'full'

// Full literal class strings so Tailwind's JIT detects them. Never build dynamically.
const SPAN: Record<Span, string> = {
  sm:   'col-span-1 md:col-span-2 xl:col-span-3',
  md:   'col-span-2 md:col-span-3 xl:col-span-4',
  lg:   'col-span-2 md:col-span-3 xl:col-span-6',
  wide: 'col-span-2 md:col-span-6 xl:col-span-8',
  full: 'col-span-2 md:col-span-6 xl:col-span-12',
}

// Flat mode: accent only faintly tints a `tint` tile; gradient degrades to subtle, solid to plain/surface.
const ACCENT_TINT: Record<Accent, string> = {
  brand:   'bg-brand-50 dark:bg-brand-500/10',
  amber:   'bg-amber-50 dark:bg-amber-500/10',
  violet:  'bg-violet-50 dark:bg-violet-500/10',
  sky:     'bg-sky-50 dark:bg-sky-500/10',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10',
  rose:    'bg-rose-50 dark:bg-rose-500/10',
  slate:   'bg-black/[0.03] dark:bg-white/[0.04]',
}

export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('grid grid-cols-2 md:grid-cols-6 xl:grid-cols-12 gap-3 auto-rows-[minmax(7rem,auto)]', className)}>
      {children}
    </div>
  )
}

export interface BentoTileProps {
  span?: Span
  tall?: boolean
  tone?: Tone
  accent?: Accent
  title?: ReactNode
  subtitle?: ReactNode
  icon?: ComponentType<{ className?: string }>
  actions?: ReactNode
  to?: string
  className?: string
  children?: ReactNode
}

export function BentoTile({
  span = 'md', tall = false, tone = 'plain', accent = 'brand',
  title, subtitle, icon: Icon, actions, to, className, children,
}: BentoTileProps) {
  // ponytail: in flat mode 'plain' and 'solid' render identically; accent only tints 'tint' tiles.
  const toneClass =
    tone === 'plain' ? 'bg-surface border border-line'
    : tone === 'tint' ? `${ACCENT_TINT[accent]} border border-line`
    : tone === 'gradient' ? 'bg-black/[0.02] dark:bg-white/[0.03] border border-line'
    : 'bg-surface border border-line'   // solid falls through to plain
  const clickable = !!to
  const cls = clsx(
    SPAN[span], tall && 'row-span-2',
    'rounded-lg p-4 transition flex flex-col text-ink',
    toneClass,
    clickable && 'hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04] cursor-pointer',
    className,
  )
  const header = (title || actions || Icon) && (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" />}
        {(title || subtitle) && (
          <div className="min-w-0">
            {title && <div className="truncate font-semibold leading-tight">{title}</div>}
            {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
          </div>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
  const inner = <>{header}{children}</>
  return to
    ? <Link to={to} className={cls}>{inner}</Link>
    : <div className={cls}>{inner}</div>
}

export function BentoStat({ value, label, delta, className }: {
  value: ReactNode; label: ReactNode; delta?: ReactNode; className?: string
}) {
  return (
    <div className={clsx('flex h-full flex-col justify-end', className)}>
      <div className="text-3xl font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted">{label}</div>
      {delta && <div className="mt-1 text-xs text-muted">{delta}</div>}
    </div>
  )
}
