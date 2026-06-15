import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { useCreateTask } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'

interface CreateTaskSheetProps {
  open: boolean
  onClose: () => void
  workItem: string
  team: { user: string; name: string }[]
}

export function CreateTaskSheet({ open, onClose, workItem, team }: CreateTaskSheetProps) {
  const toast = useToast()
  const create = useCreateTask(workItem)

  const [toDo, setToDo] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [deadline, setDeadline] = useState('')
  const [estimated, setEstimated] = useState('')
  const [notes, setNotes] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState('Daily')
  const [until, setUntil] = useState('')

  const reset = () => {
    setToDo(''); setAssignedTo(''); setDeadline(''); setEstimated('')
    setNotes(''); setIsRecurring(false); setFrequency('Daily'); setUntil('')
  }

  const close = () => { reset(); onClose() }

  const submit = () => {
    if (!toDo.trim() || !assignedTo || !deadline) {
      toast('error', 'Task name, assignee, and deadline are required')
      return
    }
    const fields: Record<string, unknown> = {
      to_do: toDo.trim(),
      assigned_to: assignedTo,
      deadline,
      notes,
    }
    if (estimated) fields.estimated = Number(estimated)
    if (isRecurring) {
      fields.is_recurring = 1
      fields.recurring_frequency = frequency
      if (until) fields.recurring_until = until
    }
    create.mutate(fields, {
      onSuccess: () => { toast('success', 'Task created'); close() },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  if (!open) return null

  const field = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={close}>
      <div
        className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">New task</h3>
          <button onClick={close} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600">
            Task<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} value={toDo} onChange={(e) => setToDo(e.target.value)} placeholder="What needs doing?" />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Assigned to<span className="text-red-500"> *</span>
            <select className={field + ' mt-1'} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Select a team member…</option>
              {team.map((m) => (
                <option key={m.user} value={m.user}>{m.name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-600">
            Deadline<span className="text-red-500"> *</span>
            <input type="date" className={field + ' mt-1'} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Estimated (minutes)
            <input type="number" min={0} className={field + ' mt-1'} value={estimated} onChange={(e) => setEstimated(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Notes
            <textarea className={field + ' mt-1'} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            Recurring
          </label>

          {isRecurring && (
            <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
              <label className="text-sm font-medium text-slate-600">
                Frequency
                <select className={field + ' mt-1'} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-600">
                Until
                <input type="date" className={field + ' mt-1'} value={until} onChange={(e) => setUntil(e.target.value)} />
              </label>
            </div>
          )}

          <button
            onClick={submit}
            disabled={create.isPending}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            {create.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Create task
          </button>
        </div>
      </div>
    </div>
  )
}
