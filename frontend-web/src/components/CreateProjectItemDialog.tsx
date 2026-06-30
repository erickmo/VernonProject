import { useState, useEffect, useRef } from 'react'
import { ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react'
import { useCreateProjectItem, useScoringGroups, useScoringGroup } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { Button } from '@web/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { Drawer } from '@web/components/overlays/Drawer'
import { computeTodoPoints } from '@/lib/points'

interface Props {
  open: boolean
  onClose: () => void
  projectDetail: string
  team: { user: string; name: string }[]
  defaultGroup?: string | null
  /** Sibling tasks in this detail, for the blocking pickers. */
  siblings?: { name: string; to_do: string }[]
}

export function CreateProjectItemDialog({ open, onClose, projectDetail, team, defaultGroup, siblings = [] }: Props) {
  const toast = useToast()
  const create = useCreateProjectItem(projectDetail)

  const [toDo, setToDo] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [startDate, setStartDate] = useState('')
  const [deadline, setDeadline] = useState('')
  const [leaderDeadline, setLeaderDeadline] = useState('')
  const [ownerDeadline, setOwnerDeadline] = useState('')
  const [estimated, setEstimated] = useState('')
  const [leaderEstimated, setLeaderEstimated] = useState('')
  const [ownerEstimated, setOwnerEstimated] = useState('')
  const [notes, setNotes] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState('Daily')
  const [until, setUntil] = useState('')
  const [group, setGroup] = useState(defaultGroup ?? '')
  const [typeName, setTypeName] = useState('')
  const [levelId, setLevelId] = useState('')
  const [blockedBy, setBlockedBy] = useState<string[]>([])
  const [blocking, setBlocking] = useState<string[]>([])

  const { data: groups } = useScoringGroups()
  const { data: groupDoc } = useScoringGroup(group, !!group)

  useEffect(() => {
    setTypeName('')
    setLevelId('')
  }, [group])

  const firstFieldRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setToDo(''); setAssignedTo(''); setStartDate(''); setDeadline(''); setEstimated('')
    setLeaderDeadline(''); setOwnerDeadline(''); setLeaderEstimated(''); setOwnerEstimated('')
    setNotes(''); setIsRecurring(false); setFrequency('Daily'); setUntil('')
    setGroup(defaultGroup ?? ''); setTypeName(''); setLevelId(''); setBlockedBy([]); setBlocking([])
  }

  // After "Save & add another": clear only the per-todo fields, keep assignee,
  // dates, and group/type/level so adding several similar todos is fast.
  const resetForNext = () => {
    setToDo(''); setEstimated(''); setNotes(''); setBlockedBy([]); setBlocking([])
    setLeaderDeadline(''); setOwnerDeadline(''); setLeaderEstimated(''); setOwnerEstimated('')
    firstFieldRef.current?.focus()
  }

  const close = () => { reset(); onClose() }

  const submit = (addAnother = false) => {
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
    if (isRecurring) {
      fields.is_recurring = 1
      fields.recurring_frequency = frequency
      if (until) fields.recurring_until = until
    }
    create.mutate(fields, {
      onSuccess: () => {
        toast('success', 'Todo created')
        if (addAnother) resetForNext()
        else close()
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500'

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

        <label className="text-sm font-medium text-muted">
          Start date<span className="text-red-500"> *</span>
          <input type="date" className={field + ' mt-1'} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-muted">
            Deadline<span className="text-red-500"> *</span>
            <input type="date" className={field + ' mt-1'} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-muted">
            Estimated (minutes)
            <input type="number" min={0} className={field + ' mt-1'} value={estimated} onChange={(e) => setEstimated(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-muted">
            Leader approval by
            <input type="date" className={field + ' mt-1'} value={leaderDeadline} onChange={(e) => setLeaderDeadline(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-muted">
            Est. for approval (min)
            <input type="number" min={0} className={field + ' mt-1'} value={leaderEstimated} onChange={(e) => setLeaderEstimated(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-muted">
            Owner approval by
            <input type="date" className={field + ' mt-1'} value={ownerDeadline} onChange={(e) => setOwnerDeadline(e.target.value)} />
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
          <div className="flex flex-col gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
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
              <input type="date" className={field + ' mt-1'} value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
          </div>
        )}
      </div>
    </Drawer>
  )
}
