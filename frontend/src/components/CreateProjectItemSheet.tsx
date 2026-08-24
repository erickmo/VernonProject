import { useState } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, X, Plus } from 'lucide-react'
import { useCreateProjectItem } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { AssignmentOverloadBanner } from '@/components/AssignmentOverloadBanner'
import { GroupLevelPicker } from '@/components/GroupLevelPicker'
import type { CreateTodoInitial } from '@/lib/duplicateTodo'
import { emptyRecurrence, recurrenceFromDetail, serializeRecurrence, type Recurrence } from '@/lib/recurrence'
import { RecurrenceEditor } from '@/components/RecurrenceEditor'

interface CreateProjectItemSheetProps {
  open: boolean
  onClose: () => void
  projectDetail: string
  team: { user: string; name: string }[]
  defaultGroup?: string | null
  /** Sibling tasks in this detail, for the blocking pickers. */
  siblings?: { name: string; to_do: string }[]
  /** Prefill the form (e.g. duplicating a todo). Remount to re-seed — useState
   *  initializers only run once, so mount this sheet fresh per open. */
  initial?: CreateTodoInitial
  onCreated?: (todoName: string) => void
  /** Reporting an issue found on this todo: links the new todo back to it (server field
   *  `issue_of`) and relabels the form. The issue is an ordinary todo otherwise. */
  issueOf?: { name: string; title: string }
}

export function CreateProjectItemSheet({ open, onClose, projectDetail, team, defaultGroup, siblings = [], initial, onCreated, issueOf }: CreateProjectItemSheetProps) {
  const toast = useToast()
  const create = useCreateProjectItem(projectDetail)

  const [toDo, setToDo] = useState(initial?.toDo ?? '')
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [deadline, setDeadline] = useState(initial?.deadline ?? '')
  const [leaderDeadline, setLeaderDeadline] = useState(initial?.leaderDeadline ?? '')
  const [ownerDeadline, setOwnerDeadline] = useState(initial?.ownerDeadline ?? '')
  const [estimated, setEstimated] = useState(initial?.estimated ?? '')
  const [leaderEstimated, setLeaderEstimated] = useState(initial?.leaderEstimated ?? '')
  const [ownerEstimated, setOwnerEstimated] = useState(initial?.ownerEstimated ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence>(
    initial ? recurrenceFromDetail({ is_recurring: initial.isRecurring ?? false, frequency: initial.frequency ?? null,
      interval: initial.interval, weekdays: initial.weekdays, monthly_mode: initial.monthlyMode,
      day_of_month: initial.dayOfMonth, nth: initial.nth, until: initial.until }) : emptyRecurrence)
  const [group, setGroup] = useState(initial?.group ?? defaultGroup ?? '')
  const [levelId, setLevelId] = useState(initial?.levelId ?? '')
  const [blockedBy, setBlockedBy] = useState<string[]>(initial?.blockedBy ?? [])
  const [blocking, setBlocking] = useState<string[]>(initial?.blocking ?? [])

  const reset = () => {
    setToDo(''); setAssignedTo(''); setStartDate(''); setDeadline(''); setEstimated('')
    setLeaderDeadline(''); setOwnerDeadline(''); setLeaderEstimated(''); setOwnerEstimated('')
    setNotes(''); setRecurrence(emptyRecurrence)
    setGroup(defaultGroup ?? ''); setLevelId(''); setBlockedBy([]); setBlocking([])
  }

  const close = () => { reset(); onClose() }

  const submit = () => {
    if (!toDo.trim() || !assignedTo || !startDate || !deadline || !group || !levelId) {
      toast('error', 'Name, assignee, start date, deadline, group and level are required')
      return
    }
    if (startDate > deadline) {
      toast('error', 'Start date cannot be after the deadline')
      return
    }
    const est = Number(estimated)
    if (!estimated || !Number.isFinite(est) || est < 5) {
      toast('error', 'Estimated time is required and must be at least 5 minutes')
      return
    }
    const fields: Record<string, unknown> = {
      to_do: toDo.trim(),
      assigned_to: assignedTo,
      start_date: startDate,
      deadline,
      notes,
      group,
      level_id: levelId,
    }
    fields.estimated = est
    if (leaderDeadline) fields.leader_deadline = leaderDeadline
    if (ownerDeadline) fields.owner_deadline = ownerDeadline
    if (leaderEstimated) fields.estimated_done_to_checked = Number(leaderEstimated)
    if (ownerEstimated) fields.estimated_checked_to_completed = Number(ownerEstimated)
    if (issueOf) fields.issue_of = issueOf.name
    if (blockedBy.length) fields.blocked_by = blockedBy.map((todo) => ({ todo }))
    if (blocking.length) fields.blocking = blocking.map((todo) => ({ todo }))
    Object.assign(fields, serializeRecurrence(recurrence))
    create.mutate(fields, {
      onSuccess: (doc) => { onCreated?.((doc as { name?: string })?.name ?? ''); toast('success', 'Todo created'); close() },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  if (!open) return null

  const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={close}>
      <div
        className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">{issueOf ? 'Report issue' : 'New todo'}</h3>
            {issueOf && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="truncate">on “{issueOf.title}”</span>
              </p>
            )}
          </div>
          <button onClick={close} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {issueOf ? 'Issue' : 'Todo'}<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} value={toDo} onChange={(e) => setToDo(e.target.value)} placeholder={issueOf ? 'What needs fixing?' : 'What needs doing?'} />
          </label>

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Assigned to<span className="text-red-500"> *</span>
            <SearchableSelect value={assignedTo} onChange={setAssignedTo} options={team.map((m) => ({ value: m.user, label: m.name }))} placeholder="Select a team member…" />
          </label>
          <AssignmentOverloadBanner user={assignedTo} date={deadline} minutes={Number(estimated) || 0} />

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Start date<span className="text-red-500"> *</span>
            <input type="date" className={field + ' mt-1'} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>

          <div className="flex gap-3">
            <label className="flex-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              Deadline<span className="text-red-500"> *</span>
              <input type="date" className={field + ' mt-1'} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <label className="flex-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              Estimated (minutes)<span className="text-red-500"> *</span>
              <input type="number" min={5} required className={field + ' mt-1'} value={estimated} onChange={(e) => setEstimated(e.target.value)} />
            </label>
          </div>

          <div className="flex gap-3">
            <label className="flex-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              Leader approval by
              <input type="date" className={field + ' mt-1'} value={leaderDeadline} onChange={(e) => setLeaderDeadline(e.target.value)} />
            </label>
            <label className="flex-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              Est. for approval (min)
              <input type="number" min={0} className={field + ' mt-1'} value={leaderEstimated} onChange={(e) => setLeaderEstimated(e.target.value)} />
            </label>
          </div>

          <div className="flex gap-3">
            <label className="flex-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              Owner approval by
              <input type="date" className={field + ' mt-1'} value={ownerDeadline} onChange={(e) => setOwnerDeadline(e.target.value)} />
            </label>
            <label className="flex-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              Est. for owner approval (min)
              <input type="number" min={0} className={field + ' mt-1'} value={ownerEstimated} onChange={(e) => setOwnerEstimated(e.target.value)} />
            </label>
          </div>

          <GroupLevelPicker
            value={{ group, typeName: '', levelId }}
            onChange={(v) => { setGroup(v.group); setLevelId(v.levelId) }}
            estimated={estimated}
          />

          {siblings.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1">
                  <ArrowDownLeft className="h-3.5 w-3.5 text-rose-500" /> Blocked by
                </span>
                <MultiSelectSearch
                  value={blockedBy}
                  onChange={setBlockedBy}
                  options={siblings.map((s) => ({ value: s.name, label: s.to_do }))}
                />
              </div>
              <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1">
                  <ArrowUpRight className="h-3.5 w-3.5 text-amber-500" /> Blocking
                </span>
                <MultiSelectSearch
                  value={blocking}
                  onChange={setBlocking}
                  options={siblings.map((s) => ({ value: s.name, label: s.to_do }))}
                />
              </div>
            </div>
          )}

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Notes
            <textarea className={field + ' mt-1'} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <RecurrenceEditor value={recurrence} onChange={setRecurrence} />

          <button
            onClick={submit}
            disabled={create.isPending}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            {create.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Create todo
          </button>
        </div>
      </div>
    </div>
  )
}
