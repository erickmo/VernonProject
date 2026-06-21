import { useState } from 'react'
import { GitMerge } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useConfirm } from '@/components/Confirm'

// Merge the current record into another of the same type. The current record is
// the source: its links move to the target and it is then deleted (Frappe
// rename_doc with merge). Lives inside the edit form for groups and brands.
export function MergeIntoCard({
  entity,
  currentLabel,
  options,
  isPending,
  onConfirm,
}: {
  entity: string
  currentLabel: string
  options: { value: string; label: string }[]
  isPending: boolean
  onConfirm: (target: string) => void
}) {
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState('')

  const targetLabel = options.find((o) => o.value === target)?.label || target

  const run = async () => {
    if (!target) return
    if (
      !(await confirm({
        title: `Merge ${entity}?`,
        message: `Merge "${currentLabel}" into "${targetLabel}"? Everything moves to "${targetLabel}" and "${currentLabel}" is deleted.`,
        confirmLabel: 'Merge',
        destructive: true,
      }))
    )
      return
    onConfirm(target)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white dark:bg-slate-800 py-3 text-sm font-semibold text-amber-700 dark:text-amber-300 shadow-card active:bg-amber-50 dark:active:bg-amber-500/15"
      >
        <GitMerge className="h-4 w-4" /> Merge into another {entity}
      </button>
    )
  }

  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <GitMerge className="h-3.5 w-3.5" /> Merge into another {entity}
      </p>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        This {entity} is deleted; its data moves to the one you pick.
      </p>
      <SearchableSelect
        value={target}
        onChange={setTarget}
        options={options}
        placeholder={`Select target ${entity}…`}
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => {
            setOpen(false)
            setTarget('')
          }}
          className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-800 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700"
        >
          Cancel
        </button>
        <button
          onClick={run}
          disabled={!target || isPending}
          className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white active:bg-rose-700 disabled:opacity-50"
        >
          {isPending ? 'Merging…' : 'Merge'}
        </button>
      </div>
    </div>
  )
}
