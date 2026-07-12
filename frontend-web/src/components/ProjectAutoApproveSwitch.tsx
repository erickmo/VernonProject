import clsx from 'clsx'

/** Project-wide auto-approve default switch (web /w). */
export function ProjectAutoApproveSwitch({
  enabled,
  disabled,
  onToggle,
}: {
  enabled: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-4 py-2.5 text-left hover:bg-hover/[0.04] disabled:opacity-60"
    >
      <span className="text-sm font-semibold text-ink">Auto-approve all todos (Owner)</span>
      <span
        className={clsx(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition',
          enabled ? 'bg-brand-600' : 'bg-line',
        )}
      >
        <span
          className={clsx(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
            enabled ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}
