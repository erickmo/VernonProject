import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { useCreateProjectDetail } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'

interface Props {
  open: boolean
  onClose: () => void
  project: string
  groupings: string[]
}

const STATUSES = ['Pending', 'Ongoing', 'Completed']

export function ProjectDetailFormSheet({ open, onClose, project, groupings = [] }: Props) {
  const toast = useToast()
  const create = useCreateProjectDetail(project)
  const [title, setTitle] = useState('')
  const [grouping, setGrouping] = useState('')
  const [deadline, setDeadline] = useState('')
  const [status, setStatus] = useState('Pending')

  const reset = () => { setTitle(''); setGrouping(''); setDeadline(''); setStatus('Pending') }
  const close = () => { reset(); onClose() }

  if (!open) return null

  const field =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none'

  const submit = () => {
    if (!title.trim() || !grouping.trim() || !deadline) {
      toast('error', 'Title, grouping and deadline are required')
      return
    }
    create.mutate(
      { title: title.trim(), grouping: grouping.trim(), project_deadline: deadline, status },
      {
        onSuccess: () => { toast('success', 'Project detail created'); close() },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={close}>
      <div className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">New detail</h3>
          <button onClick={close} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600">
            Title<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Grouping<span className="text-red-500"> *</span>
            <SearchableSelect value={grouping} onChange={setGrouping} options={groupings.map((g) => ({ value: g, label: g }))} allowCreate placeholder="Pick or type a new grouping" />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Deadline<span className="text-red-500"> *</span>
            <input type="date" className={field + ' mt-1'} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Status
            <SearchableSelect value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: s }))} />
          </label>

          <button onClick={submit} disabled={create.isPending}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {create.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Create detail
          </button>
        </div>
      </div>
    </div>
  )
}
