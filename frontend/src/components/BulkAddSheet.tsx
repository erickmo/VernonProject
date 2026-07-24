import { useState } from 'react'
import { ArrowDownLeft, X, Plus, Trash2 } from 'lucide-react'
import { useCreateProjectItems, useScoringGroups, useScoringGroup } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { AssignmentOverloadBanner } from '@/components/AssignmentOverloadBanner'
import { computeTodoPoints } from '@/lib/points'
import { emptyRecurrence, serializeRecurrence, type Recurrence } from '@/lib/recurrence'
import { RecurrenceEditor } from '@/components/RecurrenceEditor'

interface BulkAddSheetProps {
  open: boolean
  onClose: () => void
  projectDetail: string
  team: { user: string; name: string }[]
  defaultGroup?: string | null
  /** Existing tasks in this detail — blocked-by options alongside earlier batch rows. */
  siblings?: { name: string; to_do: string }[]
  onCreated?: () => void
}

interface Row {
  toDo: string
  notes: string
  /** Task names, or "#<i>" referencing an earlier row in this batch. */
  blockedBy: string[]
}

const emptyRow = (): Row => ({ toDo: '', notes: '', blockedBy: [] })

// Shared with the web dialog: bulk-add differs only in title/notes/blocked_by per
// row; every other field is filled once and applied to all. Recurrence is not
// offered here — use single-add for a recurring task.
export function BulkAddSheet({ open, onClose, projectDetail, team, defaultGroup, siblings = [], onCreated }: BulkAddSheetProps) {
  const toast = useToast()
  const create = useCreateProjectItems(projectDetail)

  const [assignedTo, setAssignedTo] = useState('')
  const [startDate, setStartDate] = useState('')
  const [deadline, setDeadline] = useState('')
  const [leaderDeadline, setLeaderDeadline] = useState('')
  const [ownerDeadline, setOwnerDeadline] = useState('')
  const [estimated, setEstimated] = useState('')
  const [leaderEstimated, setLeaderEstimated] = useState('')
  const [ownerEstimated, setOwnerEstimated] = useState('')
  const [group, setGroup] = useState(defaultGroup ?? '')
  const [typeName, setTypeName] = useState('')
  const [levelId, setLevelId] = useState('')
  const [recurrence, setRecurrence] = useState<Recurrence>(emptyRecurrence)
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()])
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null)

  const { data: groups } = useScoringGroups()
  const { data: groupDoc } = useScoringGroup(group, !!group)

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows((rs) => [...rs, emptyRow()])
  const removeRow = (i: number) =>
    setRows((rs) => {
      const next = rs.filter((_, j) => j !== i)
      // Drop dangling batch refs (indexes shift when a row is removed).
      return (next.length ? next : [emptyRow()]).map((r) => ({ ...r, blockedBy: [] }))
    })

  const filled = rows.filter((r) => r.toDo.trim())

  const reset = () => {
    setAssignedTo(''); setStartDate(''); setDeadline(''); setEstimated('')
    setLeaderDeadline(''); setOwnerDeadline(''); setLeaderEstimated(''); setOwnerEstimated('')
    setGroup(defaultGroup ?? ''); setTypeName(''); setLevelId(''); setRecurrence(emptyRecurrence)
    setRows([emptyRow(), emptyRow()]); setProg(null)
  }
  const close = () => { reset(); onClose() }

  const submit = () => {
    if (!assignedTo || !startDate || !deadline || !group || !typeName || !levelId) {
      toast('error', 'Assignee, start date, deadline, group, type and level are required')
      return
    }
    if (startDate > deadline) { toast('error', 'Start date cannot be after the deadline'); return }
    const est = Number(estimated)
    if (!estimated || !Number.isFinite(est) || est < 5) {
      toast('error', 'Estimated time is required and must be at least 5 minutes')
      return
    }
    if (!filled.length) { toast('error', 'Add at least one task title'); return }

    const shared: Record<string, unknown> = {
      assigned_to: assignedTo,
      start_date: startDate,
      deadline,
      group,
      level_id: levelId,
      estimated: est,
    }
    if (leaderDeadline) shared.leader_deadline = leaderDeadline
    if (ownerDeadline) shared.owner_deadline = ownerDeadline
    if (leaderEstimated) shared.estimated_done_to_checked = Number(leaderEstimated)
    if (ownerEstimated) shared.estimated_checked_to_completed = Number(ownerEstimated)
    Object.assign(shared, serializeRecurrence(recurrence)) // same rule applied to every task

    // Renumber batch refs against the filtered (non-empty) rows we actually send.
    const keptIndex = new Map<number, number>()
    rows.forEach((r, i) => { if (r.toDo.trim()) keptIndex.set(i, keptIndex.size) })
    const payload = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.toDo.trim())
      .map(({ r }) => ({
        to_do: r.toDo.trim(),
        notes: r.notes,
        blocked_by: r.blockedBy
          .map((b) => (b.startsWith('#') ? (keptIndex.has(Number(b.slice(1))) ? `#${keptIndex.get(Number(b.slice(1)))}` : '') : b))
          .filter(Boolean),
      }))

    setProg({ done: 0, total: payload.length })
    create.mutate({ shared, rows: payload, onProgress: (done, total) => setProg({ done, total }) }, {
      onSuccess: (res) => {
        const failed = res.failed?.length ?? 0
        if (res.created?.length) toast('success', `Created ${res.created.length} task${res.created.length > 1 ? 's' : ''}`)
        if (failed) toast('error', `${failed} task${failed > 1 ? 's' : ''} failed: ${res.failed[0].error}`)
        if (res.created?.length) { onCreated?.(); close() }
        else setProg(null)
      },
      onError: (err) => { setProg(null); toast('error', (err as Error).message) },
    })
  }

  if (!open) return null

  const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500'
  const lvl = (groupDoc?.levels ?? []).find((l) => l.level_id === levelId)
  const pts = computeTodoPoints(groupDoc?.base_rate_per_minute, Number(estimated), lvl?.difficulty_percent)

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={close}>
      <div className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Bulk add tasks</h3>
          <button onClick={close} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Shared by every task</div>

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Assigned to<span className="text-red-500"> *</span>
            <SearchableSelect value={assignedTo} onChange={setAssignedTo} options={team.map((m) => ({ value: m.user, label: m.name }))} placeholder="Select a team member…" />
          </label>
          <AssignmentOverloadBanner user={assignedTo} date={deadline} minutes={(Number(estimated) || 0) * filled.length} />

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
              <input type="number" min={5} className={field + ' mt-1'} value={estimated} onChange={(e) => setEstimated(e.target.value)} />
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
            <SearchableSelect value={group} onChange={(g) => { setGroup(g); setTypeName(''); setLevelId('') }} options={(groups ?? []).map((g) => ({ value: g.name, label: g.group_name }))} placeholder="Select a group…" />
          </label>

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Type<span className="text-red-500"> *</span>
            <SearchableSelect value={typeName} onChange={(t) => { setTypeName(t); setLevelId('') }} options={[...new Set((groupDoc?.levels ?? []).map((l) => l.type_name))].map((t) => ({ value: t, label: t }))} placeholder={group ? 'Select a type…' : 'Pick a group first…'} disabled={!group} />
          </label>

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Level<span className="text-red-500"> *</span>
            <SearchableSelect value={levelId} onChange={setLevelId} options={(groupDoc?.levels ?? []).filter((l) => l.type_name === typeName).map((l) => ({ value: l.level_id!, label: `${l.level_name} (${l.difficulty_percent}%)` }))} placeholder={typeName ? 'Select a level…' : 'Pick a type first…'} disabled={!typeName} />
          </label>
          {group && levelId && (
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Estimated points each: <span className="font-medium">{pts}</span>{!estimated && ' (set estimated minutes)'}
            </div>
          )}

          <RecurrenceEditor value={recurrence} onChange={setRecurrence} />

          <div className="mt-1 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Tasks ({filled.length})</div>
          </div>

          {rows.map((r, i) => {
            const earlier = rows.slice(0, i).map((er, j) => ({ er, j })).filter(({ er }) => er.toDo.trim())
            const blockOptions = [
              ...earlier.map(({ er, j }) => ({ value: `#${j}`, label: `↑ ${er.toDo.trim()}` })),
              ...siblings.map((s) => ({ value: s.name, label: s.to_do })),
            ]
            return (
              <div key={i} className="flex flex-col gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{i + 1}</span>
                  <input className={field} value={r.toDo} onChange={(e) => setRow(i, { toDo: e.target.value })} placeholder="Task title…" />
                  <button onClick={() => removeRow(i)} className="rounded-full p-1 text-slate-400 active:scale-95" aria-label="Remove task">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <textarea className={field} rows={2} value={r.notes} onChange={(e) => setRow(i, { notes: e.target.value })} placeholder="Note (optional)…" />
                {blockOptions.length > 0 && (
                  <div>
                    <span className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <ArrowDownLeft className="h-3.5 w-3.5 text-rose-500" /> Blocked by
                    </span>
                    <MultiSelectSearch value={r.blockedBy} onChange={(v) => setRow(i, { blockedBy: v })} options={blockOptions} />
                  </div>
                )}
              </div>
            )
          })}

          <button onClick={addRow} className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 active:scale-95">
            <Plus className="h-4 w-4" /> Add task
          </button>

          {prog && create.isPending && (
            <div className="mt-1">
              <div className="mb-1 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                Creating {prog.done} / {prog.total}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="h-full rounded-full bg-brand-600 transition-[width] duration-200" style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}

          <button onClick={submit} disabled={create.isPending} className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {create.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Create {filled.length || ''} task{filled.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
