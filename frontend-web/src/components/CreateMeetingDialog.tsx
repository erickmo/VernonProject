import { useState } from 'react'
import { Dialog } from '@web/components/overlays/Dialog'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { useCreateMeeting, useMeetingInvitableUsers } from '@/hooks/useData'
import { useToast } from '@/components/Toast'

interface Props {
  open: boolean
  onClose: () => void
  project: string
}

export function CreateMeetingDialog({ open, onClose, project }: Props) {
  const toast = useToast()
  const create = useCreateMeeting()
  const invitable = useMeetingInvitableUsers(project)

  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [estimated, setEstimated] = useState('')
  const [notes, setNotes] = useState('')
  const [participants, setParticipants] = useState<string[]>([])

  const close = () => {
    setTitle('')
    setScheduledAt('')
    setEstimated('')
    setNotes('')
    setParticipants([])
    onClose()
  }

  const submit = () => {
    if (!title.trim()) {
      toast('error', 'Title is required')
      return
    }
    const fields: Record<string, unknown> = {
      project,
      title: title.trim(),
      participants: JSON.stringify(participants),
    }
    if (scheduledAt) fields.scheduled_at = scheduledAt
    if (estimated) fields.estimated = Number(estimated)
    if (notes) fields.notes = notes
    create.mutate(fields, {
      onSuccess: () => {
        toast('success', 'Meeting created')
        close()
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  if (!open) return null
  const field =
    'w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100'
  const options = (invitable.data?.users ?? []).map((u) => ({
    value: u.user,
    label: u.full_name || u.user,
  }))

  return (
    <Dialog open={open} onClose={close} title="New meeting">
      <div className="flex flex-col gap-3">
        <input className={field} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className={field} type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        <input className={field} type="number" placeholder="Estimated minutes" value={estimated} onChange={(e) => setEstimated(e.target.value)} />
        <MultiSelectSearch value={participants} onChange={setParticipants} options={options} placeholder="Invite team members…" />
        <textarea className={field} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button onClick={submit} disabled={create.isPending} className="rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Create
        </button>
      </div>
    </Dialog>
  )
}
