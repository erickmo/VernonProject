import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, Search, Check, Plus } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
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
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400'

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

  const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label))
  const term = q.trim().toLowerCase()
  const shown = term ? sorted.filter((o) => o.label.toLowerCase().includes(term)) : sorted
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
        <span className={clsx('truncate', !selected && 'text-slate-400')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg bg-slate-50 py-1.5 pl-9 pr-3 text-sm outline-none focus:bg-white"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {allowClear && (
              <button
                type="button"
                onClick={() => pick('')}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-500 active:bg-slate-50"
              >
                Any
                {!value && <Check className="h-4 w-4 text-brand-600" />}
              </button>
            )}
            {shown.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 active:bg-slate-50"
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check className="ml-2 h-4 w-4 shrink-0 text-brand-600" />}
              </button>
            ))}
            {allowCreate && term && !exact && (
              <button
                type="button"
                onClick={() => pick(q.trim())}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-brand-600 active:bg-brand-50"
              >
                <Plus className="h-4 w-4" /> Create “{q.trim()}”
              </button>
            )}
            {!shown.length && !(allowCreate && term) && (
              <p className="px-3 py-3 text-sm text-slate-400">
                {term ? `No matches for “${q}”.` : 'No options'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
