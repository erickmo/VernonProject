import { useState, useEffect, useRef } from 'react'
import { ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react'
import { useCreateProjectItem, useScoringGroups, useScoringGroup, useProjects, useProject, useProjectDetail } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { Button } from '@web/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { AssignmentOverloadBanner } from '@/components/AssignmentOverloadBanner'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { Drawer } from '@web/components/overlays/Drawer'
import { DatePicker } from '@web/components/DatePicker'
import { RecurrenceExceptions } from '@web/components/RecurrenceExceptions'
import { computeTodoPoints } from '@/lib/points'
import type { CreateTodoInitial } from '@/lib/duplicateTodo'

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
}

export function CreateProjectItemDialog({ open, onClose, projectDetail = '', team: teamProp, defaultGroup, siblings: siblingsProp = [], initial, onCreated }: Props) {
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
  const [isRecurring, setIsRecurring] = useState(initial?.isRecurring ?? false)
  const [frequency, setFrequency] = useState(initial?.frequency ?? 'Daily')
  const [until, setUntil] = useState(initial?.until ?? '')
  const [excWeekdays, setExcWeekdays] = useState('')
  const [excMonthdays, setExcMonthdays] = useState('')
  const [excDates, setExcDates] = useState<{ from: string; to: string }[]>([])
  const [excBehavior, setExcBehavior] = useState<'Skip' | 'Shift'>('Skip')
  const [group, setGroup] = useState(initial?.group ?? defaultGroup ?? '')
  const [typeName, setTypeName] = useState(initial?.typeName ?? '')
  const [levelId, setLevelId] = useState(initial?.levelId ?? '')
  const [blockedBy, setBlockedBy] = useState<string[]>(initial?.blockedBy ?? [])
  const [blocking, setBlocking] = useState<string[]>(initial?.blocking ?? [])

  const { data: groups } = useScoringGroups()
  const { data: groupDoc } = useScoringGroup(group, !!group)

  // Reset type/level when the user actually changes group — but not on the
  // initial (possibly prefilled) group, or a duplicate's seeded level is wiped.
  const seededGroup = initial?.group ?? defaultGroup ?? ''
  useEffect(() => {
    if (group !== seededGroup) {
      setTypeName('')
      setLevelId('')
    }
  }, [group]) // eslint-disable-line react-hooks/exhaustive-deps

  // If prefilled with a level but no type name, recover the type once the
  // group's levels load (level_type may be missing on older todos).
  useEffect(() => {
    if (!typeName && levelId && groupDoc) {
      const row = groupDoc.levels.find((l) => l.level_id === levelId)
      if (row) setTypeName(row.type_name)
    }
  }, [groupDoc]) // eslint-disable-line react-hooks/exhaustive-deps

  const firstFieldRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setToDo(''); setAssignedTo(''); setStartDate(''); setDeadline(''); setEstimated('')
    setLeaderDeadline(''); setOwnerDeadline(''); setLeaderEstimated(''); setOwnerEstimated('')
    setNotes(''); setIsRecurring(false); setFrequency('Daily'); setUntil('')
    setExcWeekdays(''); setExcMonthdays(''); setExcDates([]); setExcBehavior('Skip')
    setGroup(defaultGroup ?? ''); setTypeName(''); setLevelId(''); setBlockedBy([]); setBlocking([])
  }

  // After "Save & add another": clear only the per-todo fields, keep assignee,
  // dates, and group/type/level so adding several similar todos is fast.
  const resetForNext = () => {
    setToDo(''); setEstimated(''); setNotes(''); setBlockedBy([]); setBlocking([])
    setExcWeekdays(''); setExcMonthdays(''); setExcDates([]); setExcBehavior('Skip')
    setLeaderDeadline(''); setOwnerDeadline(''); setLeaderEstimated(''); setOwnerEstimated('')
    firstFieldRef.current?.focus()
  }

  const close = () => { reset(); onClose() }

  const submit = (addAnother = false) => {
    if (pickMode && !effectiveDetail) {
      toast('error', 'Pick a project and a project detail')
      return
    }
    if (!toDo.trim() || !assignedTo || !startDate || !deadline || !group || !typeName || !levelId) {
      toast('error', 'Name, assignee, start date, deadline, group, type and level are required')
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
    if (blockedBy.length) fields.blocked_by = blockedBy.map((todo) => ({ todo }))
    if (blocking.length) fields.blocking = blocking.map((todo) => ({ todo }))
    if (isRecurring) {
      fields.is_recurring = 1
      fields.recurring_frequency = frequency
      if (until) fields.recurring_until = until
      fields.recurring_exception_weekdays = excWeekdays
      fields.recurring_exception_monthdays = excMonthdays
      fields.recurring_exception_dates = JSON.stringify(excDates)
      fields.recurring_exception_behavior = excBehavior
    }
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
      title="New todo"
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
                options={(projectsQ.data ?? []).filter((p) => p.status !== 'Closed').map((p) => ({ value: p.name, label: p.project_name ?? p.name }))}
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
          Todo<span className="text-red-500"> *</span>
          <input
            ref={firstFieldRef}
            className={field + ' mt-1'}
            value={toDo}
            onChange={(e) => setToDo(e.target.value)}
            placeholder="What needs doing?"
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

        <label className="text-sm font-medium text-muted">
          Group<span className="text-red-500"> *</span>
          <SearchableSelect
            value={group}
            onChange={setGroup}
            options={(groups ?? []).map((g) => ({ value: g.name, label: g.group_name }))}
            placeholder="Select a group…"
          />
        </label>

        <label className="text-sm font-medium text-muted">
          Type<span className="text-red-500"> *</span>
          <SearchableSelect
            value={typeName}
            onChange={(t) => { setTypeName(t); setLevelId('') }}
            options={[...new Set((groupDoc?.levels ?? []).map((l) => l.type_name))].map((t) => ({ value: t, label: t }))}
            placeholder={group ? 'Select a type…' : 'Pick a group first…'}
            disabled={!group}
          />
        </label>

        <label className="text-sm font-medium text-muted">
          Level<span className="text-red-500"> *</span>
          <SearchableSelect
            value={levelId}
            onChange={setLevelId}
            options={(groupDoc?.levels ?? []).filter((l) => l.type_name === typeName).map((l) => ({ value: l.level_id!, label: `${l.level_name} (${l.difficulty_percent}%)` }))}
            placeholder={typeName ? 'Select a level…' : 'Pick a type first…'}
            disabled={!typeName}
          />
        </label>
        {group && levelId && (() => {
          const lvl = (groupDoc?.levels ?? []).find((l) => l.level_id === levelId)
          const pts = computeTodoPoints(groupDoc?.base_rate_per_minute, Number(estimated), lvl?.difficulty_percent)
          return (
            <div className="text-sm text-muted">
              Estimated points: <span className="font-medium">{pts}</span>
              {!estimated && ' (set estimated minutes)'}
            </div>
          )
        })()}

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
          <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
          Recurring
        </label>

        {isRecurring && (
          <div className="flex flex-col gap-3 rounded-xl bg-canvas p-3">
            <label className="text-sm font-medium text-muted">
              Frequency
              <SearchableSelect
                value={frequency}
                onChange={setFrequency}
                options={['Daily', 'Weekly', 'Monthly'].map((s) => ({ value: s, label: s }))}
              />
            </label>
            <label className="text-sm font-medium text-muted">
              Until
              <DatePicker className={field + ' mt-1'} value={until} onChange={(v) => setUntil(v)} />
            </label>
            <RecurrenceExceptions
              weekdays={excWeekdays}
              monthdays={excMonthdays}
              dates={excDates}
              behavior={excBehavior}
              onChange={(p) => {
                if (p.weekdays !== undefined) setExcWeekdays(p.weekdays)
                if (p.monthdays !== undefined) setExcMonthdays(p.monthdays)
                if (p.dates !== undefined) setExcDates(p.dates)
                if (p.behavior !== undefined) setExcBehavior(p.behavior)
              }}
            />
          </div>
        )}
      </div>
    </Drawer>
  )
}
