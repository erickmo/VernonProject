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

interface ToneSet { tint: string; gradient: string; solid: string }
const ACCENTS: Record<Accent, ToneSet> = {
  brand:   { tint: 'bg-brand-50 dark:bg-brand-500/10',     gradient: 'bg-gradient-to-br from-brand-500/15 to-brand-400/5 dark:from-brand-500/20 dark:to-brand-400/5',         solid: 'bg-brand-500 text-white' },
  amber:   { tint: 'bg-amber-50 dark:bg-amber-500/10',     gradient: 'bg-gradient-to-br from-amber-500/15 to-amber-400/5 dark:from-amber-500/20 dark:to-amber-400/5',         solid: 'bg-amber-500 text-white' },
  violet:  { tint: 'bg-violet-50 dark:bg-violet-500/10',   gradient: 'bg-gradient-to-br from-violet-500/15 to-violet-400/5 dark:from-violet-500/20 dark:to-violet-400/5',     solid: 'bg-violet-500 text-white' },
  sky:     { tint: 'bg-sky-50 dark:bg-sky-500/10',         gradient: 'bg-gradient-to-br from-sky-500/15 to-sky-400/5 dark:from-sky-500/20 dark:to-sky-400/5',                 solid: 'bg-sky-500 text-white' },
  emerald: { tint: 'bg-emerald-50 dark:bg-emerald-500/10', gradient: 'bg-gradient-to-br from-emerald-500/15 to-emerald-400/5 dark:from-emerald-500/20 dark:to-emerald-400/5', solid: 'bg-emerald-500 text-white' },
  rose:    { tint: 'bg-rose-50 dark:bg-rose-500/10',       gradient: 'bg-gradient-to-br from-rose-500/15 to-rose-400/5 dark:from-rose-500/20 dark:to-rose-400/5',             solid: 'bg-rose-500 text-white' },
  slate:   { tint: 'bg-slate-100 dark:bg-slate-800',       gradient: 'bg-gradient-to-br from-slate-500/10 to-slate-400/5 dark:from-slate-700/40 dark:to-slate-800/20',       solid: 'bg-slate-700 text-white' },
}

export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('grid grid-cols-2 md:grid-cols-6 xl:grid-cols-12 gap-4 auto-rows-[minmax(7rem,auto)]', className)}>
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
  const toneClass =
    tone === 'plain' ? 'bg-white dark:bg-slate-900'
    : tone === 'tint' ? ACCENTS[accent].tint
    : tone === 'gradient' ? ACCENTS[accent].gradient
    : ACCENTS[accent].solid
  const clickable = !!to
  const cls = clsx(
    SPAN[span], tall && 'row-span-2',
    'rounded-3xl p-5 shadow-card transition flex flex-col text-slate-900 dark:text-slate-50',
    tone === 'solid' && 'text-white dark:text-white',
    toneClass,
    clickable && 'hover:-translate-y-0.5 hover:shadow-lg cursor-pointer',
    className,
  )
  const header = (title || actions || Icon) && (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="h-5 w-5 shrink-0 opacity-80" />}
        {(title || subtitle) && (
          <div className="min-w-0">
            {title && <div className="truncate font-semibold leading-tight">{title}</div>}
            {subtitle && <div className="truncate text-xs opacity-70">{subtitle}</div>}
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
      <div className="text-4xl font-bold leading-none tabular-nums xl:text-5xl">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide opacity-70">{label}</div>
      {delta && <div className="mt-1 text-xs opacity-70">{delta}</div>}
    </div>
  )
}
