import { useId, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

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
      <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-2xl bg-white dark:bg-slate-800 shadow-card">
        <AlertTriangle className="h-7 w-7 text-amber-500" />
      </div>
      <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="max-w-xs text-sm text-slate-400 dark:text-slate-500">{subtitle}</p>
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
  children,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
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
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
  }
}
