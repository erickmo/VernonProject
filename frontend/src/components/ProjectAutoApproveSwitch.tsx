import clsx from 'clsx'

/** Project-wide auto-approve default switch (mobile /m). */
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
      className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-left transition active:scale-[0.99] disabled:opacity-60"
    >
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        Auto-setujui semua todo (Owner)
      </span>
      <span
        className={clsx(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition',
          enabled ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600',
        )}
      >
        <span
          className={clsx(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition',
            enabled ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}
