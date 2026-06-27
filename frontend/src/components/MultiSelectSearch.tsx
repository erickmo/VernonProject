import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, Search, Check, X } from 'lucide-react'
import type { Opt2 } from '@/lib/types'

interface Props {
  options: Opt2[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  emptyText?: string
}

const FIELD =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-600 focus:outline-none'

// Searchable multiselect: selected entries show as removable tags, the dropdown
// filters by typed term. Scales to long option lists (e.g. many sibling todos)
// where MultiSelectChips' flat wall of toggles becomes unwieldy.
export function MultiSelectSearch({ options, value, onChange, placeholder = 'Select…', emptyText = 'No options' }: Props) {
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

  if (!options.length) return <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">{emptyText}</p>

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const remove = (v: string) => onChange(value.filter((x) => x !== v))

  const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label))
  const term = q.trim().toLowerCase()
  const shown = term ? sorted.filter((o) => o.label.toLowerCase().includes(term)) : sorted
  const selected = value
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is Opt2 => !!o)

  return (
    <div className="relative mt-1" ref={ref}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((o) => !o)
          }
        }}
        className={clsx(FIELD, 'flex min-h-[2.25rem] cursor-pointer items-center justify-between gap-2')}
      >
        <div className="flex flex-1 flex-wrap gap-1">
          {selected.length === 0 && <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>}
          {selected.map((o) => (
            <span
              key={o.value}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-brand-600 bg-brand-50 dark:bg-brand-500/20 px-2 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-300"
            >
              <span className="truncate">{o.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  remove(o.value)
                }}
                className="-mr-0.5 shrink-0 rounded-full p-0.5 hover:bg-brand-100 dark:hover:bg-brand-500/30"
                aria-label={`Remove ${o.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <ChevronDown className="ml-1 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          <div className="relative border-b border-slate-100 dark:border-slate-800 p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                // Enter toggles the top match; must not bubble to submit an
                // enclosing <form> (the drawer forms wrap these selects).
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (shown.length) toggle(shown[0].value)
                }
              }}
              placeholder="Search…"
              className="w-full rounded-lg bg-slate-50 dark:bg-slate-900 py-1.5 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:bg-white dark:focus:bg-slate-800"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {shown.map((o) => {
              const on = value.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 active:bg-slate-50 dark:active:bg-slate-700/50"
                >
                  <span className="truncate">{o.label}</span>
                  {on && <Check className="ml-2 h-4 w-4 shrink-0 text-brand-600" />}
                </button>
              )
            })}
            {!shown.length && (
              <p className="px-3 py-3 text-sm text-slate-400 dark:text-slate-500">
                {term ? `No matches for “${q}”.` : emptyText}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
