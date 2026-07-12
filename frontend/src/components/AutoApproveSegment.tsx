import clsx from 'clsx'

type Mode = 'on' | 'off' | 'inherit'

/** 3-state auto-approve control for a single todo (mobile /m).
 *  Inherit follows the project default; On/Off force per todo. */
export function AutoApproveSegment({
  mode,
  effective,
  projectDefault,
  disabled,
  onChange,
}: {
  mode: Mode
  effective: boolean
  projectDefault: boolean
  disabled?: boolean
  onChange: (mode: Mode) => void
}) {
  const opts: { key: Mode; label: string }[] = [
    { key: 'inherit', label: 'Inherit' },
    { key: 'on', label: 'On' },
    { key: 'off', label: 'Off' },
  ]
  return (
    <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Auto-setujui (Owner)
        </span>
        <span className="text-xs text-slate-400">
          {effective ? 'aktif' : 'nonaktif'}
        </span>
      </div>
      <div className="mt-2 flex gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-700/60 p-1">
        {opts.map((o) => (
          <button
            key={o.key}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className={clsx(
              'flex-1 rounded-md py-1.5 text-xs font-semibold transition disabled:opacity-60',
              mode === o.key
                ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-sm'
                : 'text-slate-500 dark:text-slate-400',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {mode === 'inherit' && (
        <p className="mt-1.5 text-xs text-slate-400">
          Ikut default proyek: {projectDefault ? 'ON' : 'OFF'}
        </p>
      )}
    </div>
  )
}
