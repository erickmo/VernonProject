import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Opt2 } from '@/lib/types'
import { MultiSelectSearch } from './MultiSelectSearch'
import { SearchableSelect } from './SearchableSelect'
import { GroupLevelPicker, emptyGroupLevel, type GroupLevel } from './GroupLevelPicker'
import { RecurrenceEditor } from './RecurrenceEditor'
import { emptyRecurrence, serializeRecurrence, type Recurrence } from '@/lib/recurrence'
import { useBoot, useCreateMeeting, useMeetingInvitableUsers, useProjects } from '@/hooks/useData'
import { useToast } from './Toast'

interface Props {
  open: boolean
  onClose: () => void
  /** Fixed project (embedded on a project page). Omit → user picks inside. */
  project?: string
}

export function CreateMeetingSheet({ open, onClose, project }: Props) {
  const toast = useToast()
  const create = useCreateMeeting()
  const { data: boot } = useBoot()
  const me = boot?.user
  const [proj, setProj] = useState(project ?? '')
  const invitable = useMeetingInvitableUsers(proj)
  const projects = useProjects()

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [estimated, setEstimated] = useState('')
  const [notes, setNotes] = useState('')
  const [participants, setParticipants] = useState<string[]>([])
  const [gl, setGl] = useState<GroupLevel>(emptyGroupLevel)
  const [recurrence, setRecurrence] = useState<Recurrence>(emptyRecurrence)

  // The creator is a participant by default — seed them when the sheet opens
  // (only if the list is still empty, so it never clobbers manual edits).
  useEffect(() => {
    if (open) setParticipants((p) => (p.length ? p : me ? [me] : []))
  }, [open, me])

  const reset = () => {
    setProj(project ?? '')
    setTitle('')
    setDate('')
    setTime('')
    setEstimated('')
    setNotes('')
    setParticipants([])
    setGl(emptyGroupLevel)
    setRecurrence(emptyRecurrence)
  }
  const close = () => {
    reset()
    onClose()
  }

  const submit = () => {
    if (!proj) {
      toast('error', 'Pick a project')
      return
    }
    if (!title.trim()) {
      toast('error', 'Title is required')
      return
    }
    if (recurrence.isRecurring && !date) {
      toast('error', 'A recurring meeting needs a date')
      return
    }
    if (!participants.length) {
      toast('error', 'Invite at least one participant')
      return
    }
    const fields: Record<string, unknown> = {
      project: proj,
      title: title.trim(),
      participants: JSON.stringify(participants),
    }
    // Separate native date + time inputs (each opens the OS modal picker — no
    // clipped-in-a-scroll-sheet calendar). Recombine to the datetime the API
    // expects; default an unset time to 09:00 rather than midnight.
    if (date) fields.scheduled_at = `${date}T${time || '09:00'}`
    if (estimated) fields.estimated = Number(estimated)
    if (notes) fields.notes = notes
    if (gl.group) fields.group = gl.group
    if (gl.levelId) fields.level_id = gl.levelId
    Object.assign(fields, serializeRecurrence(recurrence))
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
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100'

  const options: Opt2[] = (invitable.data?.users ?? []).map((u) => ({
    value: u.user,
    label: u.full_name || u.user,
  }))
  // The creator may not be on the project team — add them so their auto-added
  // chip renders (MultiSelectSearch drops selected values absent from options).
  if (me && !options.some((o) => o.value === me)) {
    options.unshift({ value: me, label: boot?.full_name || me })
  }
  // meetings can only be scheduled for unclosed (Ongoing) projects
  const projectOptions = (projects.data ?? [])
    .filter((p) => p.status !== 'Closed')
    .map((p) => ({ value: p.name, label: p.project_name ?? p.name }))

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={close}>
      <div
        className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">New meeting</h3>
          <button onClick={close} className="rounded-full p-1 text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {!project && (
            <SearchableSelect
              value={proj}
              onChange={setProj}
              options={projectOptions}
              placeholder="Pick a project…"
            />
          )}
          <input
            className={field}
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex gap-3">
            <input
              className={field + ' flex-1'}
              type="date"
              aria-label="Meeting date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <input
              className={field + ' flex-1'}
              type="time"
              aria-label="Meeting time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <input
            className={field}
            type="number"
            placeholder="Estimated minutes"
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
          />
          <GroupLevelPicker value={gl} onChange={setGl} estimated={estimated} />
          <MultiSelectSearch
            value={participants}
            onChange={setParticipants}
            options={options}
            placeholder="Invite team members…"
          />
          <textarea
            className={field}
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <RecurrenceEditor value={recurrence} onChange={setRecurrence} />
          <button
            onClick={submit}
            disabled={create.isPending}
            className="mt-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
