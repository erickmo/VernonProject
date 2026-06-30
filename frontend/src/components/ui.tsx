import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import { initials, colorFor } from '@/lib/format'
import { DiceBearAvatar } from '@/avatar/DiceBearAvatar'
import type { AvatarConfig } from '@/lib/types'

// No-avatar users get a deterministic auto avatar seeded by their name,
// instead of a bare initial. Mirrors backend DEFAULT_AVATAR (mobile.py).
const DEFAULT_AVATAR_CONFIG: AvatarConfig = { style: 'lorelei', options: {} }

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin', className)} />
}

export function FullScreenLoader({ label }: { label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-24 text-stone-400 dark:text-slate-500">
      <Spinner className="h-7 w-7 text-brand-500" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

export function Avatar({
  name,
  image,
  config,
  size = 36,
  square = false,
}: {
  name: string
  image?: string | null
  config?: AvatarConfig | null
  size?: number
  square?: boolean
}) {
  const shape = square ? 'rounded-none' : 'rounded-full ring-2 ring-white dark:ring-slate-800'
  // Prefer the live DiceBear config (always correctly framed) over the stored PNG
  // snapshot, which is off-center for avatars saved before the capture fix (c860970).
  if (config) {
    return (
      <div
        style={{ width: size, height: size }}
        className={clsx('shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-700', shape)}
      >
        <DiceBearAvatar config={config} className="h-full w-full" />
      </div>
    )
  }
  if (image) {
    return (
      <img
        src={image}
        alt={name}
        style={{ width: size, height: size }}
        className={clsx('shrink-0 object-cover', shape)}
      />
    )
  }
  if (name && name.trim()) {
    return (
      <div
        style={{ width: size, height: size }}
        className={clsx('shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-700', shape)}
      >
        {/* ponytail: seed = name; switch to an email seed if name collisions matter */}
        <DiceBearAvatar config={DEFAULT_AVATAR_CONFIG} seed={name} className="h-full w-full" />
      </div>
    )
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={clsx(
        'flex shrink-0 items-center justify-center font-semibold text-white',
        shape,
        colorFor(name || '?'),
      )}
    >
      {initials(name)}
    </div>
  )
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-paper-line dark:bg-slate-700', className)}>
      <div
        className="h-full rounded-full bg-brand-500 transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
      <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 shadow-sm">
        <Icon className="h-7 w-7 text-brand-400" />
      </div>
      <p className="font-semibold text-stone-700 dark:text-slate-200">{title}</p>
      {subtitle && <p className="max-w-xs text-sm text-stone-400 dark:text-slate-500">{subtitle}</p>}
    </div>
  )
}

export function Pill({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={clsx(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
              active
                ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                : 'border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 text-stone-600 dark:text-slate-300',
            )}
          >
            {o.label}
            {typeof o.count === 'number' && (
              <span
                className={clsx(
                  'rounded-full px-1.5 text-[11px] font-semibold',
                  active ? 'bg-white/25 text-white' : 'bg-paper-line dark:bg-slate-700 text-stone-500 dark:text-slate-400',
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; badge?: number }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-2xl bg-paper-line dark:bg-slate-800 p-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-paper-card dark:bg-slate-700 text-stone-800 dark:text-slate-50 shadow-sm' : 'text-stone-500 dark:text-slate-400',
            )}
          >
            {o.label}
            {o.badge ? (
              <span
                className={clsx(
                  'rounded-full px-1.5 text-[11px] font-semibold',
                  active ? 'bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300' : 'bg-paper-line dark:bg-slate-700 text-stone-500 dark:text-slate-400',
                )}
              >
                {o.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
