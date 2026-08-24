import { useState, useEffect, useRef } from 'react'
import { ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react'
import { useCreateProjectItem, useProjects, useProject, useProjectDetail } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { Button } from '@web/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { AssignmentOverloadBanner } from '@/components/AssignmentOverloadBanner'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { Drawer } from '@web/components/overlays/Drawer'
import { DatePicker } from '@web/components/DatePicker'
import { RecurrenceEditor } from '@web/components/RecurrenceEditor'
import { emptyRecurrence, serializeRecurrence, type Recurrence, type Frequency, type MonthlyMode, type Nth } from '@/lib/recurrence'
import { GroupLevelPicker } from '@/components/GroupLevelPicker'
import type { CreateTodoInitial } from '@/lib/duplicateTodo'

const initialRecurrence = (i?: CreateTodoInitial): Recurrence => ({
  ...emptyRecurrence,
  isRecurring: i?.isRecurring ?? false,
  frequency: (i?.frequency as Frequency) || 'Daily',
  interval: i?.interval ?? 1,
  weekdays: i?.weekdays ?? '',
  monthlyMode: (i?.monthlyMode as MonthlyMode) || 'Day of Month',
  dayOfMonth: i?.dayOfMonth ?? null,
  nth: (i?.nth as Nth) || 'First',
  until: i?.until ?? '',
})

interface Props {
  open: boolean
  onClose: () => void
  /** Fixed detail (embedded on a project-detail page). Omit → user picks project + detail inside. */
  projectDetail?: string
  /** Assignee options for the fixed detail. Omit when picking — derived from the chosen detail. */
  team?: { user: string; name: string }[]
  defaultGroup?: string | null
  /** Sibling tasks in this detail, for the blocking pickers. */
  siblings?: { name: string; to_do: string }[]
  /** Prefill the form (e.g. duplicating a todo). Remount to re-seed — useState
   *  initializers only run once, so mount this dialog fresh per open. */
  initial?: CreateTodoInitial
  onCreated?: (todoName: string) => void
  /** Reporting an issue found on this todo: links the new todo back to it (server field
   *  `issue_of`) and relabels the form. The issue is an ordinary todo otherwise. */
  issueOf?: { name: string; title: string }
}

export function CreateProjectItemDialog({ open, onClose, projectDetail = '', team: teamProp, defaultGroup, siblings: siblingsProp = [], initial, onCreated, issueOf }: Props) {
  const toast = useToast()
  // No fixed detail → let the user pick a project then one of its details.
  const pickMode = !projectDetail
  const [pickProject, setPickProject] = useState('')
  const [pickDetail, setPickDetail] = useState('')
  const effectiveDetail = projectDetail || pickDetail
  const create = useCreateProjectItem(effectiveDetail)

  const projectsQ = useProjects()
  const projectQ = useProject(pickMode ? pickProject : '')
  const pickedDetailQ = useProjectDetail(pickMode ? pickDetail : '')

  // Assignee list + blocking siblings come from props when embedded, else from
  // the picked detail. defaultGroup prefill only applies in embedded mode.
  const team = pickMode ? (pickedDetailQ.data?.team ?? []).map((t) => ({ user: t.user, name: t.name })) : (teamProp ?? [])
  const siblings = pickMode
    ? (pickedDetailQ.data?.project_items ?? []).map((t) => ({ name: t.name, to_do: t.to_do }))
    : siblingsProp

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
  const [rec, setRec] = useState<Recurrence>(() => initialRecurrence(initial))
  const [group, setGroup] = useState(initial?.group ?? defaultGroup ?? '')
  const [levelId, setLevelId] = useState(initial?.levelId ?? '')
  const [blockedBy, setBlockedBy] = useState<string[]>(initial?.blockedBy ?? [])
  const [blocking, setBlocking] = useState<string[]>(initial?.blocking ?? [])

  const firstFieldRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setToDo(''); setAssignedTo(''); setStartDate(''); setDeadline(''); setEstimated('')
    setLeaderDeadline(''); setOwnerDeadline(''); setLeaderEstimated(''); setOwnerEstimated('')
    setNotes(''); setRec({ ...emptyRecurrence })
    setGroup(defaultGroup ?? ''); setLevelId(''); setBlockedBy([]); setBlocking([])
  }

  // After "Save & add another": clear only the per-todo fields, keep assignee,
  // dates, and group/type/level so adding several similar todos is fast.
  const resetForNext = () => {
    setToDo(''); setEstimated(''); setNotes(''); setBlockedBy([]); setBlocking([])
    setRec((r) => ({ ...r, exceptionWeekdays: '', exceptionMonthdays: '', exceptionDates: [], exceptionBehavior: 'Skip' }))
    setLeaderDeadline(''); setOwnerDeadline(''); setLeaderEstimated(''); setOwnerEstimated('')
    firstFieldRef.current?.focus()
  }

  const close = () => { reset(); onClose() }

  const submit = (addAnother = false) => {
    if (pickMode && !effectiveDetail) {
      toast('error', 'Pick a project and a project detail')
      return
    }
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
    Object.assign(fields, serializeRecurrence(rec))
    create.mutate(fields, {
      onSuccess: (doc) => {
        onCreated?.((doc as { name?: string })?.name ?? '')
        toast('success', 'Todo created')
        if (addAnother) resetForNext()
        else close()
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  const field = 'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

  return (
    <Drawer
      open={open}
      onClose={close}
      title={issueOf ? `Report issue on “${issueOf.title}”` : 'New todo'}
      widthClass="max-w-xl"
      scrim="bg-black/20"
      onSubmit={() => submit(false)}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="secondary" onClick={() => submit(true)} disabled={create.isPending}>
            Save &amp; add another
          </Button>
          <Button variant="primary" type="submit" disabled={create.isPending}>
            {create.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Add todo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {pickMode && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-muted">
              Project<span className="text-red-500"> *</span>
              <SearchableSelect
                value={pickProject}
                onChange={(v) => { setPickProject(v); setPickDetail('') }}
                options={(projectsQ.data ?? []).filter((p) => p.status !== 'Closed' && (p.is_owner || p.is_leader || p.is_admin)).map((p) => ({ value: p.name, label: p.project_name ?? p.name }))}
                placeholder="Select a project…"
              />
            </label>
            <label className="text-sm font-medium text-muted">
              Project detail<span className="text-red-500"> *</span>
              <SearchableSelect
                value={pickDetail}
                onChange={setPickDetail}
                options={(projectQ.data?.project_details ?? []).map((d) => ({ value: d.name, label: d.title }))}
                placeholder={pickProject ? 'Select a detail…' : 'Pick a project first…'}
                disabled={!pickProject}
              />
            </label>
          </div>
        )}
        <label className="text-sm font-medium text-muted">
          {issueOf ? 'Issue' : 'Todo'}<span className="text-red-500"> *</span>
          <input
            ref={firstFieldRef}
            className={field + ' mt-1'}
            value={toDo}
            onChange={(e) => setToDo(e.target.value)}
            placeholder={issueOf ? 'What needs fixing?' : 'What needs doing?'}
          />
        </label>

        <label className="text-sm font-medium text-muted">
          Assigned to<span className="text-red-500"> *</span>
          <SearchableSelect
            value={assignedTo}
            onChange={setAssignedTo}
            options={team.map((m) => ({ value: m.user, label: m.name }))}
            placeholder="Select a team member…"
          />
        </label>
        <AssignmentOverloadBanner user={assignedTo} date={deadline} minutes={Number(estimated) || 0} />

        <label className="text-sm font-medium text-muted">
          Start date<span className="text-red-500"> *</span>
          <DatePicker className={field + ' mt-1'} value={startDate} onChange={(v) => setStartDate(v)} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-muted">
            Deadline<span className="text-red-500"> *</span>
            <DatePicker className={field + ' mt-1'} value={deadline} onChange={(v) => setDeadline(v)} />
          </label>
          <label className="text-sm font-medium text-muted">
            Estimated (minutes)<span className="text-red-500"> *</span>
            <input type="number" min={5} required className={field + ' mt-1'} value={estimated} onChange={(e) => setEstimated(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-muted">
            Leader approval by
            <DatePicker className={field + ' mt-1'} value={leaderDeadline} onChange={(v) => setLeaderDeadline(v)} />
          </label>
          <label className="text-sm font-medium text-muted">
            Est. for approval (min)
            <input type="number" min={0} className={field + ' mt-1'} value={leaderEstimated} onChange={(e) => setLeaderEstimated(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-muted">
            Owner approval by
            <DatePicker className={field + ' mt-1'} value={ownerDeadline} onChange={(v) => setOwnerDeadline(v)} />
          </label>
          <label className="text-sm font-medium text-muted">
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
            <div className="text-sm font-medium text-muted">
              <span className="flex items-center gap-1">
                <ArrowDownLeft className="h-3.5 w-3.5 text-rose-500" /> Blocked by
              </span>
              <MultiSelectSearch
                value={blockedBy}
                onChange={setBlockedBy}
                options={siblings.map((s) => ({ value: s.name, label: s.to_do }))}
              />
            </div>
            <div className="text-sm font-medium text-muted">
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

        <label className="text-sm font-medium text-muted">
          Notes
          <textarea className={field + ' mt-1'} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-muted">
          <input type="checkbox" checked={rec.isRecurring} onChange={(e) => setRec({ ...rec, isRecurring: e.target.checked })} />
          Recurring
        </label>

        {rec.isRecurring && <RecurrenceEditor value={rec} onChange={setRec} />}
      </div>
    </Drawer>
  )
}
