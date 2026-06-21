import { useEffect } from 'react'
import clsx from 'clsx'
import { SlidersHorizontal, X, RotateCcw } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'

export interface FilterDimension {
  key: string
  label: string
  options: { value: string; label: string; count?: number }[]
}

export type FilterValue = Record<string, string>

export function activeFilterCount(value: FilterValue): number {
  return Object.values(value).filter((v) => v && v !== '').length
}

/** A pill button that opens the sheet, showing the number of active filters. */
export function FilterButton({
  count,
  onClick,
}: {
  count: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition active:scale-95',
        count > 0
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300',
      )}
    >
      <SlidersHorizontal className="h-4 w-4" />
      Filters
      {count > 0 && (
        <span className="rounded-full bg-white/25 px-1.5 text-[11px] font-semibold">{count}</span>
      )}
    </button>
  )
}

function DimensionGroup({
  dim,
  selected,
  onSelect,
}: {
  dim: FilterDimension
  selected: string
  onSelect: (v: string) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{dim.label}</p>
        {selected && (
          <button onClick={() => onSelect('')} className="text-xs font-medium text-brand-600">
            Clear
          </button>
        )}
      </div>
      <SearchableSelect
        value={selected}
        onChange={onSelect}
        options={dim.options.map((o) => ({ value: o.value, label: o.label }))}
        allowClear
        placeholder="Any"
      />
    </div>
  )
}

export function FilterSheet({
  open,
  onClose,
  dimensions,
  value,
  onChange,
  onClear,
}: {
  open: boolean
  onClose: () => void
  dimensions: FilterDimension[]
  value: FilterValue
  onChange: (key: string, val: string) => void
  onClear: () => void
}) {
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  if (!open) return null
  const count = activeFilterCount(value)

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={onClose} />
      <div className="relative max-h-[82vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl animate-slide-up">
        {/* grabber + header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 px-5 pt-3">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Filters</h2>
            <div className="flex items-center gap-2">
              {count > 0 && (
                <button
                  onClick={onClear}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium text-brand-600 active:bg-brand-50 dark:active:bg-brand-500/15"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              )}
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 dark:text-slate-500 active:bg-slate-100 dark:active:bg-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-5 pt-1">
          {dimensions.map((dim) => (
            <DimensionGroup
              key={dim.key}
              dim={dim}
              selected={value[dim.key] || ''}
              onSelect={(v) => onChange(dim.key, v)}
            />
          ))}
        </div>

        <div className="mt-6 px-5">
          <button
            onClick={onClose}
            className="w-full rounded-2xl bg-brand-600 py-3.5 font-semibold text-white shadow-sm active:bg-brand-700"
          >
            Show results
          </button>
        </div>
      </div>
    </div>
  )
}
