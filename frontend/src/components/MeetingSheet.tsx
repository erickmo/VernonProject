import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X, Check, RotateCcw, Pencil, Users, FolderKanban, Trash2, Clock, CalendarDays, CalendarPlus, Coins, Copy, Repeat } from 'lucide-react'
import type { MeetingListItem, Opt2 } from '@/lib/types'
import { MultiSelectSearch } from './MultiSelectSearch'
import { GroupLevelPicker, emptyGroupLevel, type GroupLevel } from './GroupLevelPicker'
import { RecurrenceEditor } from './RecurrenceEditor'
import { emptyRecurrence, serializeRecurrence, summarizeRecurrence, recurrenceFromMeeting, type Recurrence } from '@/lib/recurrence'
import {
  useCreateMeeting,
  useReopenMeeting,
  useUpdateMeeting,
  useSetMeetingParticipants,
  useDeleteMeeting,
  useMeetingInvitableUsers,
} from '@/hooks/useData'
import { MarkDoneSheet } from './MarkDoneSheet'
import { showGoogleCal } from './GoogleCalButton'
import { googleCalUrl } from '@/lib/googleCal'
import { useToast } from './Toast'
import { useConfirm } from './Confirm'

const DONE = '✅ Done'
const field =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100'

// Slide-up detail for a single meeting + its management actions. Reused wherever
// a meeting row is tapped (currently the calendar day sheet). Every action that
// mutates the meeting closes the sheet so the caller's refreshed list shows.
// variant: 'sheet' = mobile bottom-sheet (default); 'modal' = centered dialog (/w).
export function MeetingSheet({ meeting, onClose, variant = 'sheet' }: { meeting: MeetingListItem | null; onClose: () => void; variant?: 'sheet' | 'modal' }) {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const create = useCreateMeeting()
  const reopen = useReopenMeeting()
  const update = useUpdateMeeting()
  const setParticipants = useSetMeetingParticipants()
  const del = useDeleteMeeting()

  const [mode, setMode] = useState<'view' | 'edit' | 'participants' | 'duplicate'>('view')
  const [markDoneOpen, setMarkDoneOpen] = useState(false)
  // Edit form state (seeded lazily when entering edit mode).
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [estimated, setEstimated] = useState('')
  const [notes, setNotes] = useState('')
  const [gl, setGl] = useState<GroupLevel>(emptyGroupLevel)
  const [people, setPeople] = useState<string[]>([])
  const [recurrence, setRecurrence] = useState<Recurrence>(emptyRecurrence)

  const invitable = useMeetingInvitableUsers((mode === 'participants' || mode === 'duplicate') && meeting ? meeting.project : '')

  if (!meeting) return null
  const m = meeting
  const isDone = m.status === DONE
  const canManage = m.can_mark_done
  const busy = create.isPending || reopen.isPending || update.isPending || setParticipants.isPending || del.isPending

  const run = (p: Promise<{ message: string }>, ok: string) =>
    p.then((r) => {
      toast('success', r.message || ok)
      onClose()
    }).catch((e) => toast('error', (e as Error).message))

  const startEdit = () => {
    setTitle(m.title)
    setDate(m.scheduled_at ? m.scheduled_at.slice(0, 10) : '')
    setTime(m.scheduled_at ? m.scheduled_at.slice(11, 16) : '')
    setEstimated(m.estimated ? String(m.estimated) : '')
    setNotes(m.notes ?? '')
    setGl({ group: m.group ?? '', typeName: '', levelId: m.level_id ?? '' })
    setRecurrence(recurrenceFromMeeting(m))
    setMode('edit')
  }
  const saveEdit = () => {
    if (!title.trim()) return toast('error', 'Title is required')
    if (recurrence.isRecurring && !date) return toast('error', 'A recurring meeting needs a date')
    const fields: Record<string, unknown> = { meeting: m.name, title: title.trim(), notes }
    fields.scheduled_at = date ? `${date}T${time || '09:00'}` : ''
    fields.estimated = Number(estimated || 0)
    // Send group/level so points recompute — empty clears them (point → 0).
    fields.group = gl.group
    fields.level_id = gl.levelId
    Object.assign(fields, serializeRecurrence(recurrence))
    run(update.mutateAsync(fields), 'Meeting updated')
  }

  // Duplicate: seed the create form from this meeting, don't save until the user
  // hits Create. Same project; date/time copied verbatim (a true prefill).
  const startDuplicate = () => {
    setTitle(m.title)
    setDate(m.scheduled_at ? m.scheduled_at.slice(0, 10) : '')
    setTime(m.scheduled_at ? m.scheduled_at.slice(11, 16) : '')
    setEstimated(m.estimated ? String(m.estimated) : '')
    setNotes(m.notes ?? '')
    setGl({ group: m.group ?? '', typeName: '', levelId: m.level_id ?? '' })
    setRecurrence(recurrenceFromMeeting(m))
    setPeople(m.participants)
    setMode('duplicate')
  }
  const submitDuplicate = () => {
    if (!title.trim()) return toast('error', 'Title is required')
    if (recurrence.isRecurring && !date) return toast('error', 'A recurring meeting needs a date')
    if (!people.length) return toast('error', 'Invite at least one participant')
    const fields: Record<string, unknown> = {
      project: m.project,
      title: title.trim(),
      participants: JSON.stringify(people),
    }
    if (date) fields.scheduled_at = `${date}T${time || '09:00'}`
    if (estimated) fields.estimated = Number(estimated)
    if (notes) fields.notes = notes
    if (gl.group) fields.group = gl.group
    if (gl.levelId) fields.level_id = gl.levelId
    Object.assign(fields, serializeRecurrence(recurrence))
    run(create.mutateAsync(fields), 'Meeting duplicated')
  }

  const startParticipants = () => {
    setPeople(m.participants)
    setMode('participants')
  }
  const saveParticipants = () =>
    people.length
      ? run(setParticipants.mutateAsync({ meeting: m.name, users: people }), 'Participants updated')
      : toast('error', 'A meeting must have at least one participant')

  const onDelete = async () => {
    const yes = await confirm({
      title: 'Delete meeting',
      message: isDone
        ? `Delete “${m.title}”? Points already awarded for this meeting will be removed.`
        : `Delete “${m.title}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!yes) return
    run(del.mutateAsync(m.name), 'Meeting deleted')
  }

  const options: Opt2[] = (invitable.data?.users ?? []).map((u) => ({ value: u.user, label: u.full_name || u.user }))

  // Portal to <body>: on /w this renders inside Page, whose animate-rise leaves
  // transform:translateY(0) (fill-mode:both) — a containing block that would pin
  // this `fixed` overlay to the Page box instead of the viewport.
  return createPortal(
   <>
    <div
      className={
        variant === 'modal'
          ? 'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40'
          : 'fixed inset-0 z-[60] flex flex-col justify-end bg-black/40'
      }
      onClick={onClose}
    >
      <div
        className={
          variant === 'modal'
            ? 'max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white dark:bg-slate-800 p-5 shadow-2xl'
            : 'max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">{m.title}</h3>
            <span className="text-xs text-slate-500">{m.status}</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        {mode === 'view' && (
          <>
            <dl className="mb-4 space-y-2 text-sm">
              <Row
                icon={FolderKanban}
                label="Project"
                value={m.project_name || m.project}
                onClick={() => { onClose(); navigate(`/project/${encodeURIComponent(m.project)}`) }}
              />
              <Row icon={Users} label="Organizer" value={m.organizer} />
              {m.scheduled_at && <Row icon={CalendarDays} label="When" value={`${m.scheduled_at.slice(0, 10)} · ${m.scheduled_at.slice(11, 16)}`} />}
              {m.is_recurring ? <Row icon={Repeat} label="Repeats" value={summarizeRecurrence(recurrenceFromMeeting(m)) + (m.recurring_paused ? ' (paused)' : '')} /> : null}
              {m.estimated > 0 && <Row icon={Clock} label="Estimated" value={`${m.estimated} min`} />}
              {m.point > 0 && <Row icon={Coins} label="Points" value={`${Math.round(m.point)} each`} />}
              <Row icon={Users} label="Participants" value={m.participants.length ? m.participants.join(', ') : '—'} />
              {m.notes && <p className="whitespace-pre-wrap rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 text-slate-600 dark:text-slate-300">{m.notes}</p>}
            </dl>

            <div className="flex flex-col gap-2">
              {/* Primary action — the one thing you usually came here to do. */}
              {canManage && (isDone ? (
                <Action onClick={() => run(reopen.mutateAsync(m.name), 'Reopened')} disabled={busy} icon={RotateCcw} tone="muted">
                  Reopen (removes points)
                </Action>
              ) : (
                <Action onClick={() => setMarkDoneOpen(true)} disabled={busy} icon={Check} tone="brand">
                  Mark done &amp; award points
                </Action>
              ))}

              {/* Manage / share actions, grouped in a compact grid. */}
              <div className="grid grid-cols-2 gap-2">
                {canManage && !isDone && (
                  <Action onClick={startEdit} disabled={busy} icon={Pencil} tone="plain">Edit</Action>
                )}
                {canManage && !isDone && (
                  <Action onClick={startParticipants} disabled={busy} icon={Users} tone="plain">Participants</Action>
                )}
                <Action onClick={startDuplicate} disabled={busy} icon={Copy} tone="plain">Duplicate</Action>
                {showGoogleCal(m) && (
                  <Action onClick={() => window.open(googleCalUrl(m)!, '_blank', 'noopener,noreferrer')} icon={CalendarPlus} tone="plain">
                    Google Calendar
                  </Action>
                )}
              </div>

              {/* Destructive — set apart below a divider. */}
              {canManage && (
                <>
                  <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                  <Action onClick={onDelete} disabled={busy} icon={Trash2} tone="danger">Delete meeting</Action>
                </>
              )}
            </div>
          </>
        )}

        {mode === 'edit' && (
          <div className="flex flex-col gap-3">
            <input className={field} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="flex gap-3">
              <input className={field + ' flex-1'} type="date" aria-label="Meeting date" value={date} onChange={(e) => setDate(e.target.value)} />
              <input className={field + ' w-32'} type="time" aria-label="Meeting time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <input className={field} type="number" placeholder="Estimated minutes" value={estimated} onChange={(e) => setEstimated(e.target.value)} />
            <GroupLevelPicker value={gl} onChange={setGl} estimated={estimated} />
            <textarea className={field} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <RecurrenceEditor value={recurrence} onChange={setRecurrence} />
            <div className="flex gap-2">
              <button onClick={() => setMode('view')} disabled={busy} className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-700 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-200 disabled:opacity-40">Cancel</button>
              <button onClick={saveEdit} disabled={busy} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Save</button>
            </div>
          </div>
        )}

        {mode === 'duplicate' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-slate-400">New meeting in {m.project} — prefilled from “{m.title}”. Nothing is saved until you press Create.</p>
            <input className={field} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="flex gap-3">
              <input className={field + ' flex-1'} type="date" aria-label="Meeting date" value={date} onChange={(e) => setDate(e.target.value)} />
              <input className={field + ' w-32'} type="time" aria-label="Meeting time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <input className={field} type="number" placeholder="Estimated minutes" value={estimated} onChange={(e) => setEstimated(e.target.value)} />
            <GroupLevelPicker value={gl} onChange={setGl} estimated={estimated} />
            <MultiSelectSearch value={people} onChange={setPeople} options={options} placeholder="Invite team members…" />
            <textarea className={field} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <RecurrenceEditor value={recurrence} onChange={setRecurrence} />
            <div className="flex gap-2">
              <button onClick={() => setMode('view')} disabled={busy} className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-700 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-200 disabled:opacity-40">Cancel</button>
              <button onClick={submitDuplicate} disabled={busy} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Create</button>
            </div>
          </div>
        )}

        {mode === 'participants' && (
          <div className="flex flex-col gap-3">
            <MultiSelectSearch value={people} onChange={setPeople} options={options} placeholder="Invite team members…" />
            <div className="flex gap-2">
              <button onClick={() => setMode('view')} disabled={busy} className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-700 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-200 disabled:opacity-40">Cancel</button>
              <button onClick={saveParticipants} disabled={busy} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
    <MarkDoneSheet meeting={markDoneOpen ? m : null} onClose={() => setMarkDoneOpen(false)} onDone={onClose} />
   </>,
   document.body,
  )
}

function Row({ icon: Icon, label, value, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; onClick?: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <span className="w-24 shrink-0 text-slate-400">{label}</span>
      {onClick ? (
        <button onClick={onClick} className="min-w-0 flex-1 break-words text-left font-medium text-brand-600 hover:underline dark:text-brand-400">{value}</button>
      ) : (
        <span className="min-w-0 flex-1 break-words text-slate-700 dark:text-slate-200">{value}</span>
      )}
    </div>
  )
}

const TONE: Record<string, string> = {
  brand: 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300',
  plain: 'bg-slate-50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200',
  muted: 'bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400',
  danger: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400',
}
function Action({
  onClick, disabled, icon: Icon, tone, children,
}: {
  onClick: () => void; disabled?: boolean; icon: React.ComponentType<{ className?: string }>; tone: keyof typeof TONE; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={disabled} className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40 ${TONE[tone]}`}>
      <Icon className="h-4 w-4" /> {children}
    </button>
  )
}
