import { useState, useEffect } from 'react'
import { ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react'
import { useCreateProjectItem, useScoringGroups, useScoringGroup } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectChips } from '@/components/MultiSelectChips'
import { Dialog } from '@web/components/overlays/Dialog'

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
  const [level, setLevel] = useState('')
  const [blockedBy, setBlockedBy] = useState<string[]>([])
  const [blocking, setBlocking] = useState<string[]>([])

  const { data: groups } = useScoringGroups()
  const { data: groupDoc } = useScoringGroup(group, !!group)

  useEffect(() => {
    setLevel('')
  }, [group])

  const reset = () => {
    setToDo(''); setAssignedTo(''); setDeadline(''); setEstimated('')
    setLeaderDeadline(''); setOwnerDeadline(''); setLeaderEstimated(''); setOwnerEstimated('')
    setNotes(''); setIsRecurring(false); setFrequency('Daily'); setUntil('')
    setGroup(defaultGroup ?? ''); setLevel(''); setBlockedBy([]); setBlocking([])
  }

  const close = () => { reset(); onClose() }

  const submit = () => {
    if (!toDo.trim() || !assignedTo || !deadline || !group || !level) {
      toast('error', 'Name, assignee, deadline, group and level are required')
      return
    }
    const fields: Record<string, unknown> = {
      to_do: toDo.trim(),
      assigned_to: assignedTo,
      deadline,
      notes,
      group,
      level,
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
      onSuccess: () => { toast('success', 'Todo created'); close() },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500'

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New todo"
      widthClass="max-w-2xl"
      footer={
        <>
          <button
            onClick={close}
            className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {create.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Create todo
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Todo<span className="text-red-500"> *</span>
          <input
            className={field + ' mt-1'}
            value={toDo}
            onChange={(e) => setToDo(e.target.value)}
            placeholder="What needs doing?"
          />
        </label>

        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Assigned to<span className="text-red-500"> *</span>
          <SearchableSelect
            value={assignedTo}
            onChange={setAssignedTo}
            options={team.map((m) => ({ value: m.user, label: m.name }))}
            placeholder="Select a team member…"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Deadline<span className="text-red-500"> *</span>
            <input type="date" className={field + ' mt-1'} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Estimated (minutes)
            <input type="number" min={0} className={field + ' mt-1'} value={estimated} onChange={(e) => setEstimated(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Leader approval by
            <input type="date" className={field + ' mt-1'} value={leaderDeadline} onChange={(e) => setLeaderDeadline(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Est. for approval (min)
            <input type="number" min={0} className={field + ' mt-1'} value={leaderEstimated} onChange={(e) => setLeaderEstimated(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Owner approval by
            <input type="date" className={field + ' mt-1'} value={ownerDeadline} onChange={(e) => setOwnerDeadline(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
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
          Level<span className="text-red-500"> *</span>
          <SearchableSelect
            value={level}
            onChange={setLevel}
            options={[...(groupDoc?.levels ?? [])]
              .sort((a, b) => Number(a.level_name) - Number(b.level_name))
              .map((l) => ({ value: l.level_name, label: `${l.level_name} (${l.point} pts)` }))}
            placeholder={group ? 'Select a level…' : 'Pick a group first…'}
            disabled={!group}
          />
        </label>

        {siblings.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <ArrowDownLeft className="h-3.5 w-3.5 text-rose-500" /> Blocked by
              </span>
              <MultiSelectChips
                value={blockedBy}
                onChange={setBlockedBy}
                options={siblings.map((s) => ({ value: s.name, label: s.to_do }))}
              />
            </div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <ArrowUpRight className="h-3.5 w-3.5 text-amber-500" /> Blocking
              </span>
              <MultiSelectChips
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

        <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
          Recurring
        </label>

        {isRecurring && (
          <div className="flex flex-col gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Frequency
              <SearchableSelect
                value={frequency}
                onChange={setFrequency}
                options={['Daily', 'Weekly', 'Monthly'].map((s) => ({ value: s, label: s }))}
              />
            </label>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Until
              <input type="date" className={field + ' mt-1'} value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
          </div>
        )}
      </div>
    </Dialog>
  )
}
