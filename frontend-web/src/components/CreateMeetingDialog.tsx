import { useState } from 'react'
import { Dialog } from '@web/components/overlays/Dialog'
import { DatePicker } from '@web/components/DatePicker'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { GroupLevelPicker, emptyGroupLevel, type GroupLevel } from '@/components/GroupLevelPicker'
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
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [estimated, setEstimated] = useState('')
  const [notes, setNotes] = useState('')
  const [participants, setParticipants] = useState<string[]>([])
  const [gl, setGl] = useState<GroupLevel>(emptyGroupLevel)

  const close = () => {
    setTitle('')
    setDate('')
    setTime('')
    setEstimated('')
    setNotes('')
    setParticipants([])
    setGl(emptyGroupLevel)
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
    if (date) fields.scheduled_at = `${date}T${time || '09:00'}`
    if (estimated) fields.estimated = Number(estimated)
    if (notes) fields.notes = notes
    if (gl.group) fields.group = gl.group
    if (gl.levelId) fields.level_id = gl.levelId
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
    'w-full rounded-lg border border-line px-3 py-2 text-sm text-ink bg-hover/[0.04]'
  const options = (invitable.data?.users ?? []).map((u) => ({
    value: u.user,
    label: u.full_name || u.user,
  }))

  return (
    <Dialog open={open} onClose={close} title="New meeting">
      <div className="flex flex-col gap-3">
        <input className={field} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-3">
          <DatePicker className={field + ' flex-1'} aria-label="Meeting date" value={date} onChange={(v) => setDate(v)} />
          <input className={field + ' w-32'} type="time" aria-label="Meeting time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <input className={field} type="number" placeholder="Estimated minutes" value={estimated} onChange={(e) => setEstimated(e.target.value)} />
        <GroupLevelPicker value={gl} onChange={setGl} estimated={estimated} />
        <MultiSelectSearch value={participants} onChange={setParticipants} options={options} placeholder="Invite team members…" />
        <textarea className={field} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button onClick={submit} disabled={create.isPending} className="rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Create
        </button>
      </div>
    </Dialog>
  )
}
