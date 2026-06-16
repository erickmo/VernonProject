import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { useUpdateWorkItem, useGroups } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { stripHtml } from '@/lib/format'
import type { WorkItem } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  workItem: WorkItem
}

const STATUSES = ['Pending', 'Ongoing', 'Completed']

export function WorkItemEditSheet({ open, onClose, workItem }: Props) {
  const toast = useToast()
  const update = useUpdateWorkItem(workItem.name)
  const { data: groups } = useGroups(workItem.project, open)

  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('Pending')
  const [grouping, setGrouping] = useState('')
  const [condition, setCondition] = useState('')
  const [outcome, setOutcome] = useState('')

  useEffect(() => {
    if (open) {
      setTitle(workItem.title)
      setStatus(workItem.status)
      setGrouping(workItem.grouping)
      setCondition(stripHtml(workItem.current_condition || ''))
      setOutcome(stripHtml(workItem.expected_outcome || ''))
    }
  }, [open, workItem])

  if (!open) return null

  const field =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none'

  const submit = () => {
    if (!title.trim() || !grouping) {
      toast('error', 'Title and group are required')
      return
    }
    update.mutate(
      {
        title: title.trim(),
        status,
        grouping,
        current_condition: condition,
        expected_outcome: outcome,
      },
      {
        onSuccess: () => { toast('success', 'Work item updated'); onClose() },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const groupOpts = (groups ?? []).map((g) => ({ value: g.name, label: g.glossary }))

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Edit work item</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600">
            Title<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Group<span className="text-red-500"> *</span>
            <SearchableSelect value={grouping} onChange={setGrouping} options={groupOpts} placeholder="Select a group…" />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Status
            <SearchableSelect value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: s }))} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Current condition
            <textarea className={field + ' mt-1'} rows={2} value={condition} onChange={(e) => setCondition(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Expected outcome
            <textarea className={field + ' mt-1'} rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
          </label>

          <button onClick={submit} disabled={update.isPending}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {update.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}
