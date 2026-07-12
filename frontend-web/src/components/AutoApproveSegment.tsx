import clsx from 'clsx'

type Mode = 'on' | 'off' | 'inherit'

// Shared 3-button segment — the only part `compact` mode keeps.
function Segment({ mode, disabled, onChange }: { mode: Mode; disabled?: boolean; onChange: (mode: Mode) => void }) {
  const opts: { key: Mode; label: string }[] = [
    { key: 'inherit', label: 'Inherit' },
    { key: 'on', label: 'On' },
    { key: 'off', label: 'Off' },
  ]
  return (
    <div className="inline-flex rounded-md border border-line p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          disabled={disabled}
          onClick={() => onChange(o.key)}
          className={clsx(
            'rounded px-3 py-1 text-xs font-semibold transition disabled:opacity-60',
            mode === o.key ? 'bg-brand-600 text-white' : 'text-muted hover:bg-hover/[0.04]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** 3-state auto-approve control for a single todo (web /w). `compact` drops
 * the card/heading/badge/hint for use inside a DataTable cell. */
export function AutoApproveSegment({
  mode,
  effective,
  projectDefault,
  disabled,
  compact,
  onChange,
}: {
  mode: Mode
  effective: boolean
  projectDefault: boolean
  disabled?: boolean
  compact?: boolean
  onChange: (mode: Mode) => void
}) {
  if (compact) return <Segment mode={mode} disabled={disabled} onChange={onChange} />

  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">Auto-approve (Owner)</span>
        <span className="text-xs text-muted">{effective ? 'active' : 'off'}</span>
      </div>
      <div className="mt-2">
        <Segment mode={mode} disabled={disabled} onChange={onChange} />
      </div>
      {mode === 'inherit' && (
        <p className="mt-1.5 text-xs text-muted">
          Follows project default: {projectDefault ? 'ON' : 'OFF'}
        </p>
      )}
    </div>
  )
}
