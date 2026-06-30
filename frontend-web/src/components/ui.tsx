import {
  useId, useState, useRef, forwardRef,
  type ReactNode, type ComponentType, type ButtonHTMLAttributes,
} from 'react'
import clsx from 'clsx'
import { AlertTriangle, RotateCw, MoreVertical } from 'lucide-react'
import { Popover } from '@web/components/overlays/Popover'

/** Animated placeholder block for loading states. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 dark:bg-slate-800/70 ${className}`} />
}

/** Loading placeholder for card-grid pages (Projects, Marketplace, …). */
export function CardGridSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-44" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

/**
 * Desktop error state for failed queries. Distinguishes a real failure from an
 * empty result (which should use EmptyState from @/components/ui instead).
 */
export function ErrorState({
  title = 'Something went wrong',
  subtitle = 'Could not load this data. Check your connection and try again.',
  onRetry,
}: {
  title?: string
  subtitle?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
      <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-lg bg-surface">
        <AlertTriangle className="h-7 w-7 text-amber-500" />
      </div>
      <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="max-w-xs text-sm text-muted">{subtitle}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RotateCw className="w-4 h-4" /> Retry
        </button>
      )}
    </div>
  )
}

/**
 * Labeled form field wrapper. Associates the label with the control via a
 * generated id, shows a required marker, and renders an inline error.
 * Use: <Field label="Email" required error={err}>{(id) => <input id={id} .../>}</Field>
 */
export function Field({
  label,
  required,
  error,
  hint,
  className = '',
  children,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  className?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

/**
 * Makes a non-button element (e.g. a table row) behave like an accessible
 * button: keyboard focusable, Enter/Space activates. Spread onto the element.
 *   <tr {...rowButtonProps(() => navigate(...))}>
 */
export function rowButtonProps(onActivate: () => void) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      // Let nested interactive children (e.g. an inline action button) handle
      // their own Enter/Space — only activate when the row itself is focused.
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
  }
}

// ─────────────────────────── Button system ───────────────────────────
// Content-width by default. Pass className="w-full" only for the rare narrow
// mobile-drawer CTA — never as a default. Hit target ≥ 36px (sm) / 40px (md).

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:pointer-events-none'

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary:
    'bg-surface text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700',
  ghost: 'text-muted hover:bg-slate-100 dark:hover:bg-slate-800',
  danger: 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40',
}

const BTN_SIZE: Record<ButtonSize, string> = {
  md: 'h-10 px-4 text-sm',
  sm: 'h-9 px-3 text-sm',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={clsx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

/** Square icon-only button (kebab, close). Defaults to ghost. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'ghost', size = 'md', className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={clsx(BTN_BASE, BTN_VARIANT[variant], size === 'sm' ? 'h-9 w-9' : 'h-10 w-10', className)}
      {...props}
    />
  ),
)
IconButton.displayName = 'IconButton'

// ─────────────────────────── Overflow (kebab) menu ───────────────────────────

export type MenuItem = {
  label?: ReactNode
  icon?: ComponentType<{ className?: string }>
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  /** Renders a separator line; other fields ignored. */
  divider?: boolean
}

/** Kebab button + dropdown menu. Reuses Popover (focus-out/Esc close). */
export function OverflowMenu({
  items,
  label = 'More actions',
  size = 'md',
}: {
  items: MenuItem[]
  label?: string
  size?: ButtonSize
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const real = items.filter((it) => it.divider || it.label != null)
  if (real.length === 0) return null
  return (
    <div className="relative shrink-0">
      <IconButton
        ref={ref}
        size={size}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical className="h-5 w-5" />
      </IconButton>
      <Popover open={open} onClose={() => { setOpen(false); ref.current?.focus() }} anchorRef={ref} align="right">
        <div role="menu" className="-m-2 py-1">
          {real.map((it, i) =>
            it.divider ? (
              <div key={i} className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false)
                  it.onClick?.()
                }}
                className={clsx(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none',
                  it.danger
                    ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                {it.icon && <it.icon className="h-4 w-4 shrink-0" />}
                {it.label}
              </button>
            ),
          )}
        </div>
      </Popover>
    </div>
  )
}
