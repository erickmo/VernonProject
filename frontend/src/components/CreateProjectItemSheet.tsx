import { useState, useEffect } from 'react'
import { ArrowDownLeft, ArrowUpRight, X, Plus } from 'lucide-react'
import { useCreateProjectItem, useScoringGroups, useScoringGroup } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { computeTodoPoints } from '@/lib/points'
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
}

export function CreateProjectItemSheet({ open, onClose, projectDetail, team, defaultGroup, siblings = [], initial }: CreateProjectItemSheetProps) {
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

  const reset = () => {
    setToDo(''); setAssignedTo(''); setStartDate(''); setDeadline(''); setEstimated('')
    setLeaderDeadline(''); setOwnerDeadline(''); setLeaderEstimated(''); setOwnerEstimated('')
    setNotes(''); setRecurrence(emptyRecurrence)
    setGroup(defaultGroup ?? ''); setTypeName(''); setLevelId(''); setBlockedBy([]); setBlocking([])
  }

  const close = () => { reset(); onClose() }

  const submit = () => {
    if (!toDo.trim() || !assignedTo || !startDate || !deadline || !group || !typeName || !levelId) {
      toast('error', 'Name, assignee, start date, deadline, group, type and level are required')
      return
    }
    if (startDate > deadline) {
      toast('error', 'Start date cannot be after the deadline')
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
    if (estimated) fields.estimated = Number(estimated)
    if (leaderDeadline) fields.leader_deadline = leaderDeadline
    if (ownerDeadline) fields.owner_deadline = ownerDeadline
    if (leaderEstimated) fields.estimated_done_to_checked = Number(leaderEstimated)
    if (ownerEstimated) fields.estimated_checked_to_completed = Number(ownerEstimated)
    if (blockedBy.length) fields.blocked_by = blockedBy.map((todo) => ({ todo }))
    if (blocking.length) fields.blocking = blocking.map((todo) => ({ todo }))
    Object.assign(fields, serializeRecurrence(recurrence))
    create.mutate(fields, {
      onSuccess: () => { toast('success', 'Todo created'); close() },
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
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">New todo</h3>
          <button onClick={close} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Todo<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} value={toDo} onChange={(e) => setToDo(e.target.value)} placeholder="What needs doing?" />
          </label>

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Assigned to<span className="text-red-500"> *</span>
            <SearchableSelect value={assignedTo} onChange={setAssignedTo} options={team.map((m) => ({ value: m.user, label: m.name }))} placeholder="Select a team member…" />
          </label>

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
              Estimated (minutes)
              <input type="number" min={0} className={field + ' mt-1'} value={estimated} onChange={(e) => setEstimated(e.target.value)} />
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

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Group<span className="text-red-500"> *</span>
            <SearchableSelect
              value={group}
              onChange={setGroup}
              options={(groups ?? []).map((g) => ({ value: g.name, label: g.group_name }))}
              placeholder="Select a group…"
            />
          </label>

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Type<span className="text-red-500"> *</span>
            <SearchableSelect
              value={typeName}
              onChange={(t) => { setTypeName(t); setLevelId('') }}
              options={[...new Set((groupDoc?.levels ?? []).map((l) => l.type_name))].map((t) => ({ value: t, label: t }))}
              placeholder={group ? 'Select a type…' : 'Pick a group first…'}
              disabled={!group}
            />
          </label>

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
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
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Estimated points: <span className="font-medium">{pts}</span>
                {!estimated && ' (set estimated minutes)'}
              </div>
            )
          })()}

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
