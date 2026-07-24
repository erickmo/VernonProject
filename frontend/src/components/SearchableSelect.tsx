import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, Search, Check, Plus } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  /** Extra text matched by the search box but not shown (e.g. project name). */
  keywords?: string
  /** Renders as a non-selectable group heading (e.g. a project above its details). */
  header?: boolean
  /** Indents the row under its heading and prefixes a ↳ mark (e.g. a project detail). */
  indent?: boolean
}

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  /** Adds a leading "Any" entry that selects the empty value (for filters). */
  allowClear?: boolean
  /** Offers "Create '<term>'" when the typed term has no exact label match. */
  allowCreate?: boolean
  id?: string
}

const FIELD =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-600 focus:outline-none disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-400'

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  allowClear,
  allowCreate,
  id,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // With headers present, keep the caller's order (header then its children);
  // otherwise alpha-sort as before.
  const hasHeaders = options.some((o) => o.header)
  const term = q.trim().toLowerCase()
  const match = (o: SelectOption) => (o.keywords ? `${o.label} ${o.keywords}` : o.label).toLowerCase().includes(term)
  const sorted = hasHeaders ? options : [...options].sort((a, b) => a.label.localeCompare(b.label))
  let shown: SelectOption[]
  if (!term) shown = sorted
  else if (!hasHeaders) shown = sorted.filter(match)
  else {
    // Match only real rows; keep a header when a child before the next header matches.
    const keep = sorted.map((o) => !o.header && match(o))
    shown = sorted.filter((o, i) => {
      if (!o.header) return keep[i]
      for (let j = i + 1; j < sorted.length && !sorted[j].header; j++) if (keep[j]) return true
      return false
    })
  }
  const firstPick = shown.find((o) => !o.header)
  const selected = options.find((o) => o.value === value)
  const exact = !!term && options.some((o) => o.label.toLowerCase() === term)

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setQ('')
  }

  return (
    <div className="relative mt-1" ref={ref}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={clsx(FIELD, 'flex items-center justify-between text-left')}
      >
        <span className={clsx('truncate', !selected && 'text-slate-400 dark:text-slate-500')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          <div className="relative border-b border-slate-100 dark:border-slate-800 p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                // Enter picks the top match (and must not bubble to submit an
                // enclosing <form> — the drawer forms wrap these selects).
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (firstPick) pick(firstPick.value)
                  else if (allowCreate && term && !exact) pick(q.trim())
                }
              }}
              placeholder="Search…"
              className="w-full rounded-lg bg-slate-50 dark:bg-slate-900 py-1.5 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:bg-white dark:focus:bg-slate-800"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {allowClear && (
              <button
                type="button"
                onClick={() => pick('')}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 active:bg-slate-50 dark:active:bg-slate-700/50"
              >
                Any
                {!value && <Check className="h-4 w-4 text-brand-600" />}
              </button>
            )}
            {shown.map((o) =>
              o.header ? (
                <div
                  key={o.value}
                  className="truncate px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500"
                >
                  {o.label}
                </div>
              ) : (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => pick(o.value)}
                  className={clsx(
                    'flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 active:bg-slate-50 dark:active:bg-slate-700/50',
                    o.indent && 'pl-7',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {o.indent && <span className="shrink-0 text-slate-300 dark:text-slate-600">↳</span>}
                    <span className="truncate">{o.label}</span>
                  </span>
                  {o.value === value && <Check className="ml-2 h-4 w-4 shrink-0 text-brand-600" />}
                </button>
              ),
            )}
            {allowCreate && term && !exact && (
              <button
                type="button"
                onClick={() => pick(q.trim())}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-brand-600 dark:text-brand-400 active:bg-brand-50 dark:active:bg-brand-500/15"
              >
                <Plus className="h-4 w-4" /> Create “{q.trim()}”
              </button>
            )}
            {!shown.length && !(allowCreate && term) && (
              <p className="px-3 py-3 text-sm text-slate-400 dark:text-slate-500">
                {term ? `No matches for “${q}”.` : 'No options'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
