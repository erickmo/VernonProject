import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Ban,
  CalendarDays,
  CalendarRange,
  Check,
  Clock,
  FileText,
  History,
  Layers,
  Link2,
  Lock,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  Save,
  Target,
  Timer,
  Trash2,
  X,
} from 'lucide-react'
import {
  useProjectItem,
  useSaveNotes,
  useSetTodoAllocations,
  useUpdateTodo,
  useScoringGroups,
  useScoringGroup,
  useCancelTodo,
  useRestoreTodo,
} from '@/hooks/useData'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { STATUS, STATUS_ORDER } from '@/lib/status'
import { formatClock, formatEstimate, formatDate, formatNumber, stripHtml } from '@/lib/format'
import { Avatar, Spinner } from '@/components/ui'
import CommentThread from '@/components/CommentThread'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { FocusOverlay } from '@web/components/FocusOverlay'
import { useAdvance } from '@/components/AdvanceProvider'
import type { ProjectItemDetail, StatusKey } from '@/lib/types'

// ─────────────────────────── Stepper ───────────────────────────

function Stepper({ current }: { current: StatusKey }) {
  const idx = STATUS_ORDER.indexOf(current as StatusKey)
  return (
    <div className="flex items-center">
      {STATUS_ORDER.map((key, i) => {
        const meta = STATUS[key]
        const done = i < idx
        const active = i === idx
        return (
          <div key={key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={clsx(
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm transition',
                  active && 'border-brand-500 bg-brand-500 text-white',
                  done && 'border-emerald-500 bg-emerald-500 text-white',
                  !active && !done && 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-300 dark:text-slate-600',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : <span>{meta.emoji}</span>}
              </div>
              <span
                className={clsx(
                  'w-16 text-center text-[10px] font-medium leading-tight',
                  active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-400 dark:text-slate-500',
                )}
              >
                {meta.label}
              </span>
            </div>
            {i < STATUS_ORDER.length - 1 && (
              <div className={clsx('-mt-5 h-0.5 flex-1', i < idx ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────── StatTile ───────────────────────────

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  sub?: string
  tone?: 'default' | 'danger' | 'brand'
}) {
  const accent =
    tone === 'danger'
      ? 'border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/15'
      : tone === 'brand'
        ? 'border-brand-100 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/15'
        : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60'
  const valueColor =
    tone === 'danger'
      ? 'text-rose-700 dark:text-rose-300'
      : tone === 'brand'
        ? 'text-brand-700 dark:text-brand-300'
        : 'text-slate-800 dark:text-slate-100'
  const iconColor =
    tone === 'danger' ? 'text-rose-500' : tone === 'brand' ? 'text-brand-500' : 'text-slate-400 dark:text-slate-500'
  return (
    <div className={clsx('rounded-2xl border p-3', accent)}>
      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <Icon className={clsx('h-3 w-3', iconColor)} /> {label}
      </p>
      <div className={clsx('truncate text-sm font-bold leading-tight', valueColor)}>{value}</div>
      {sub && <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  )
}

// ─────────────────────────── Dependencies ───────────────────────────

function DepGroup({
  icon: Icon,
  label,
  tone,
  items,
  resolve,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  tone: 'rose' | 'amber'
  items: string[]
  resolve: (id: string) => string
}) {
  if (!items.length) return null
  const toneCls = tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
  return (
    <div className="mb-3 last:mb-0">
      <p className={clsx('mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide', toneCls)}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((id) => (
          <Link
            key={id}
            to={`/project-item/${encodeURIComponent(id)}`}
            className="inline-flex max-w-full items-center rounded-lg bg-slate-100 dark:bg-slate-700/60 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 transition hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <span className="truncate">{resolve(id)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────── Notes ───────────────────────────

function Notes({ todoId, initial, canEdit }: { todoId: string; initial: string; canEdit: boolean }) {
  const save = useSaveNotes(todoId)
  const toast = useToast()
  const [text, setText] = useState(stripHtml(initial))
  const [saved, setSaved] = useState(false)
  const baseline = useRef(stripHtml(initial))

  useEffect(() => {
    const clean = stripHtml(initial)
    if (baseline.current === text) {
      baseline.current = clean
      setText(clean)
    }
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    if (text === baseline.current) return
    save.mutate(text, {
      onSuccess: (res) => {
        baseline.current = text
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        toast('success', res.message)
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  if (!canEdit) {
    const clean = stripHtml(initial)
    return clean ? (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">{clean}</p>
    ) : (
      <p className="text-sm italic text-slate-400 dark:text-slate-500">No notes yet.</p>
    )
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        rows={4}
        placeholder="Add a quick note about your progress…"
        className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200 outline-none transition focus:border-brand-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-brand-100 dark:placeholder-slate-500"
      />
      <div className="mt-1.5 flex h-5 items-center justify-end text-xs text-slate-400 dark:text-slate-500">
        {save.isPending ? (
          <span className="inline-flex items-center gap-1">
            <Spinner className="h-3 w-3" /> Saving…
          </span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        ) : text !== baseline.current ? (
          <span>Click outside to save</span>
        ) : null}
      </div>
    </div>
  )
}

// ─────────────────────────── AllocationCard ───────────────────────────

type AllocRow = { date: string; minutes: number; note: string }

// Assignee-only editor to split a todo's effort across days. Planning only —
// saved via its own endpoint, never affects scoring/status.
function AllocationCard({ data }: { data: ProjectItemDetail }) {
  const save = useSetTodoAllocations(data.name)
  const toast = useToast()
  const [rows, setRows] = useState<AllocRow[]>(
    (data.allocations ?? []).map((a) => ({ date: a.date, minutes: a.minutes, note: a.note ?? '' })),
  )

  const total = rows.reduce((s, r) => s + (Number(r.minutes) || 0), 0)
  const field =
    'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-2.5 py-2 text-sm focus:border-brand-600 focus:outline-none dark:placeholder-slate-500'

  const addRow = () => setRows((r) => [...r, { date: '', minutes: 0, note: '' }])
  const removeRow = (i: number) => setRows((r) => r.filter((_, j) => j !== i))
  const setRow = (i: number, patch: Partial<AllocRow>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const onSave = () => {
    // allocation_date is required on each row — don't silently drop rows with
    // minutes but no date.
    if (rows.some((r) => !r.date && Number(r.minutes) > 0)) {
      toast('error', 'Add a date to every allocation row')
      return
    }
    // Daily split must add up to the task estimate (planning consistency).
    if (data.estimated > 0 && total !== data.estimated) {
      const diff = data.estimated - total
      toast(
        'error',
        diff > 0
          ? `${diff}m short of the ${data.estimated}m estimate`
          : `${-diff}m over the ${data.estimated}m estimate`,
      )
      return
    }
    const clean = rows.filter((r) => r.date)
    save.mutate(clean, {
      onSuccess: () => toast('success', 'Allocations saved'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <div className="mt-4 rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <CalendarRange className="h-4 w-4" /> Split across days
        </p>
        <span
          className={
            'rounded-full px-2 py-0.5 text-[11px] font-bold ' +
            (!data.estimated
              ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300'
              : total === data.estimated
                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300')
          }
        >
          {total}m{data.estimated ? ` / ${data.estimated}m est` : ''}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-2"
          >
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={r.date}
                onChange={(e) => setRow(i, { date: e.target.value })}
                className={field + ' min-w-0 flex-1'}
              />
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={String(r.minutes || '')}
                placeholder="min"
                onChange={(e) => setRow(i, { minutes: e.target.value === '' ? 0 : Number(e.target.value) })}
                className={field + ' w-20 shrink-0 text-center'}
              />
              <button
                onClick={() => removeRow(i)}
                className="shrink-0 rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/15"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              value={r.note}
              placeholder="Note (what you'll do this day)…"
              onChange={(e) => setRow(i, { note: e.target.value })}
              className={field + ' w-full'}
            />
          </div>
        ))}
        {!rows.length && (
          <p className="py-1 text-center text-xs text-slate-400 dark:text-slate-500">
            No day split yet — add a day to plan your time.
          </p>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={addRow}
          className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
        >
          <Plus className="h-4 w-4" /> Add day
        </button>
        <button
          onClick={onSave}
          disabled={save.isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {save.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save split
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────── EditForm ───────────────────────────

function EditForm({ data, onClose }: { data: ProjectItemDetail; onClose: () => void }) {
  const update = useUpdateTodo(data.name)
  const toast = useToast()
  const locked = data.fields_locked
  const [toDo, setToDo] = useState(data.to_do)
  const [assignee, setAssignee] = useState(data.assigned_to)
  const [deadline, setDeadline] = useState(data.deadline ?? '')
  const [leaderDeadline, setLeaderDeadline] = useState(data.leader_deadline ?? '')
  const [ownerDeadline, setOwnerDeadline] = useState(data.owner_deadline ?? '')
  const [estimated, setEstimated] = useState(String(data.estimated || ''))
  const [pDC, setPDC] = useState(String(data.phase_estimates.done_to_checked || ''))
  const [pCC, setPCC] = useState(String(data.phase_estimates.checked_to_completed || ''))
  const [recurring, setRecurring] = useState(data.recurring.is_recurring)
  const [freq, setFreq] = useState(data.recurring.frequency || 'Weekly')
  const [until, setUntil] = useState(data.recurring.until ?? '')
  const [group, setGroup] = useState(data.group ?? '')
  const [level, setLevel] = useState(data.level ?? '')
  const [blockedBy, setBlockedBy] = useState<string[]>(data.blocked_by ?? [])
  const [blocking, setBlocking] = useState<string[]>(data.blocking ?? [])

  const { data: groups } = useScoringGroups()
  const { data: groupDoc } = useScoringGroup(group, !!group)

  useEffect(() => {
    if (group !== (data.group ?? '')) {
      setLevel('')
    }
  }, [group]) // eslint-disable-line react-hooks/exhaustive-deps

  const phaseTotal = (Number(pDC) || 0) + (Number(pCC) || 0)

  const team =
    data.team.some((m) => m.user === data.assigned_to) || !data.assigned_to
      ? data.team
      : [{ user: data.assigned_to, name: data.assigned_to_name, image: data.assigned_to_image }, ...data.team]

  const save = () => {
    if (update.isPending) return
    if (!group || !level) {
      toast('error', 'Group and level are required')
      return
    }
    if (!locked && !deadline) {
      toast('error', 'Deadline is required')
      return
    }
    const fields: Record<string, unknown> = { to_do: toDo }
    if (!locked) {
      fields.assigned_to = assignee
      fields.deadline = deadline
      fields.estimated = estimated === '' ? 0 : Number(estimated)
    }
    fields.estimated_done_to_checked = Number(pDC) || 0
    fields.estimated_checked_to_completed = Number(pCC) || 0
    fields.is_recurring = recurring ? 1 : 0
    if (recurring) {
      fields.recurring_frequency = freq
      fields.recurring_until = until || ''
    }
    fields.leader_deadline = leaderDeadline || ''
    fields.owner_deadline = ownerDeadline || ''
    fields.group = group
    fields.level = level
    fields.blocked_by = JSON.stringify(blockedBy)
    fields.blocking = JSON.stringify(blocking)
    update.mutate(fields, {
      onSuccess: (res) => {
        toast('success', res.message)
        onClose()
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  const fieldCls =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-[15px] text-slate-800 dark:text-slate-100 outline-none transition focus:border-brand-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-brand-100 disabled:opacity-60 dark:placeholder-slate-500'

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Edit todo</p>

      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Title</label>
      <textarea
        value={toDo}
        onChange={(e) => setToDo(e.target.value)}
        rows={2}
        className={clsx(fieldCls, 'mb-3 resize-none')}
      />

      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Assigned to</label>
      <select
        value={assignee}
        disabled={locked}
        onChange={(e) => setAssignee(e.target.value)}
        className={clsx(fieldCls, 'mb-3')}
      >
        {team.map((m) => (
          <option key={m.user} value={m.user}>
            {m.name}
          </option>
        ))}
      </select>

      <div className="mb-3 flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Deadline</label>
          <input
            type="date"
            value={deadline}
            disabled={locked}
            onChange={(e) => setDeadline(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Est. (min)</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={estimated}
            disabled={locked}
            onChange={(e) => setEstimated(e.target.value)}
            className={fieldCls}
          />
        </div>
      </div>

      {/* Approval phases */}
      <div className="mb-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Approval phases (optional)</span>
          <span className="rounded-full bg-brand-100 dark:bg-brand-500/20 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:text-brand-300">
            Est total {phaseTotal || 0}m
          </span>
        </div>
        {[
          { label: 'Leader approval', date: leaderDeadline, setDate: setLeaderDeadline, est: pDC, setEst: setPDC },
          { label: 'Owner approval', date: ownerDeadline, setDate: setOwnerDeadline, est: pCC, setEst: setPCC },
        ].map((p) => (
          <div key={p.label} className="mb-3 last:mb-0">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">{p.label}</label>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Deadline
                </span>
                <input
                  type="date"
                  value={p.date}
                  onChange={(e) => p.setDate(e.target.value)}
                  className={clsx(fieldCls, 'min-w-0')}
                />
              </div>
              <div className="w-24 shrink-0">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Est.
                </span>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step="1"
                    value={p.est}
                    placeholder="0"
                    onChange={(e) => p.setEst(e.target.value)}
                    className={clsx(fieldCls, 'pr-7 text-right')}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
                    m
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recurring */}
      <div className="mb-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 p-3">
        <label className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Repeat className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Repeat this todo
          </span>
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            className="h-5 w-5 accent-brand-600"
          />
        </label>
        {recurring && (
          <div className="mt-3 flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Frequency</label>
              <select value={freq} onChange={(e) => setFreq(e.target.value)} className={fieldCls}>
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Until (optional)
              </label>
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={fieldCls} />
            </div>
          </div>
        )}
      </div>

      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
        Group <span className="text-red-500">*</span>
      </label>
      <div className="mb-3">
        <SearchableSelect
          value={group}
          onChange={setGroup}
          options={(groups ?? []).map((g) => ({ value: g.name, label: g.group_name }))}
          placeholder="Select a group…"
        />
      </div>

      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
        Level <span className="text-red-500">*</span>
      </label>
      <div className="mb-3">
        <SearchableSelect
          value={level}
          onChange={setLevel}
          options={[...(groupDoc?.levels ?? [])]
            .sort((a, b) => Number(a.level_name) - Number(b.level_name))
            .map((l) => ({ value: l.level_name, label: `${l.level_name} (${l.point} pts)` }))}
          placeholder={group ? 'Select a level…' : 'Pick a group first…'}
          disabled={!group}
        />
      </div>

      {data.detail_todos.length > 0 && (
        <div className="mb-3">
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <ArrowDownLeft className="h-3.5 w-3.5 text-rose-500" /> Blocked by
          </label>
          <MultiSelectSearch
            value={blockedBy}
            onChange={setBlockedBy}
            options={data.detail_todos.map((t) => ({ value: t.name, label: t.to_do }))}
          />
          <label className="mb-1 mt-3 flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <ArrowUpRight className="h-3.5 w-3.5 text-amber-500" /> Blocking
          </label>
          <MultiSelectSearch
            value={blocking}
            onChange={setBlocking}
            options={data.detail_todos.map((t) => ({ value: t.name, label: t.to_do }))}
          />
        </div>
      )}

      {locked && (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <Lock className="h-3.5 w-3.5" />
          Assignee, deadline &amp; estimate are locked once a todo is Done.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
        >
          <X className="h-4 w-4" /> Cancel
        </button>
        <button
          onClick={save}
          disabled={update.isPending || !toDo.trim()}
          className="flex flex-[2] items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {update.isPending ? <Spinner className="h-4 w-4" /> : <><Save className="h-4 w-4" /> Save changes</>}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────── Main page ───────────────────────────

export default function ProjectItem() {
  const params = useParams()
  const todoName = decodeURIComponent(params.itemName ?? params.name ?? '')

  const { data, isLoading } = useProjectItem(todoName)
  const advanceConfirm = useAdvance()
  const cancelTodo = useCancelTodo()
  const restoreTodo = useRestoreTodo()
  const confirm = useConfirm()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const focus = useFocusTimer()
  const [focusOpen, setFocusOpen] = useState(false)

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-slate-400 dark:text-slate-500">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">Could not load todo</p>
      </div>
    )
  }

  const onAdvance = () => {
    if (data.next_status_label) advanceConfirm(data.name, data.next_status_label, data.to_do)
  }

  const onCancel = async () => {
    try {
      const res = await cancelTodo.mutateAsync({
        projectItem: data.name,
        reason: cancelReason.trim() || undefined,
      })
      toast(res.status === 'ok' ? 'success' : 'info', res.message)
      setShowCancel(false)
      setCancelReason('')
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Cancel failed')
    }
  }

  const onRestore = async () => {
    const ok = await confirm({ title: 'Restore this task to Planned?', confirmLabel: 'Restore' })
    if (!ok) return
    try {
      const res = await restoreTodo.mutateAsync(data.name)
      toast(res.status === 'ok' ? 'success' : 'info', res.message)
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Restore failed')
    }
  }

  const focusActive = focus.timer?.taskId === data.name
  const openFocus = () => {
    if (!focusActive) focus.start(data.name, data.to_do, data.estimated)
    setFocusOpen(true)
  }
  const focusOver = focusActive && focus.hasEstimate && focus.remainingMs < 0
  const focusValueMs = focusActive ? (focus.hasEstimate ? focus.remainingMs : focus.elapsedMs) : 0

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      {/* Focus overlay — full-screen, rendered above everything */}
      {focusOpen && focusActive && focus.timer && (
        <FocusOverlay
          title={focus.timer.taskTitle}
          meta={{
            project: data.project_name,
            deadlineHuman: data.deadline_human || undefined,
            overdue: data.is_overdue,
            estimateLabel: data.estimated > 0 ? formatEstimate(data.estimated) : undefined,
            group: data.group ? [data.group, data.level].filter(Boolean).join(' · ') : undefined,
          }}
          displayMs={focus.hasEstimate ? focus.remainingMs : focus.elapsedMs}
          fraction={focus.fraction}
          stopwatch={!focus.hasEstimate}
          paused={focus.timer.status === 'paused'}
          onPause={focus.pause}
          onResume={focus.resume}
          onReset={focus.reset}
          onStop={() => {
            focus.stop()
            setFocusOpen(false)
          }}
          onClose={() => setFocusOpen(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {data.project_name}
          </p>
          <Link
            to={`/project-detail/${encodeURIComponent(data.project_detail)}`}
            className="text-sm text-brand-600 hover:underline dark:text-brand-400"
          >
            in {data.project_detail_title}
          </Link>
          <h2 className="mt-1 text-xl font-bold leading-snug text-slate-900 dark:text-slate-50">{data.to_do}</h2>
        </div>
        {data.can_edit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 dark:bg-brand-500/15 px-3.5 py-2 text-sm font-semibold text-brand-700 dark:text-brand-300 transition hover:bg-brand-100"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <EditForm data={data} onClose={() => setEditing(false)} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ── LEFT COLUMN ── */}
          <div className="space-y-5">
            {/* Badges */}
            {(data.is_missed || data.recurring.is_recurring || data.phase_estimates.total > 0) && (
              <div className="flex flex-wrap gap-2">
                {data.is_missed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                    <AlertCircle className="h-3.5 w-3.5" /> Missed occurrence
                  </span>
                )}
                {data.recurring.is_recurring && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300">
                    <Repeat className="h-3.5 w-3.5" /> Repeats {data.recurring.frequency?.toLowerCase()}
                  </span>
                )}
                {data.phase_estimates.total > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 dark:bg-brand-500/20 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
                    <Clock className="h-3.5 w-3.5" /> {formatEstimate(data.phase_estimates.total)} total
                  </span>
                )}
              </div>
            )}

            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <Target className="h-3 w-3 text-slate-400 dark:text-slate-500" /> Assignee
                </p>
                <div className="flex items-center gap-1.5">
                  <Avatar name={data.assigned_to_name} image={data.assigned_to_image} size={20} />
                  <span className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                    {data.assigned_to_name}
                  </span>
                </div>
              </div>

              <StatTile
                icon={CalendarDays}
                label="Deadline"
                tone={data.is_overdue ? 'danger' : 'default'}
                value={data.deadline_human || formatDate(data.deadline) || '—'}
                sub={data.is_overdue ? 'Overdue' : undefined}
              />

              <StatTile
                icon={Clock}
                label="Estimate"
                value={data.estimated > 0 ? formatEstimate(data.estimated) : '—'}
                sub={
                  data.phase_estimates.total > data.estimated
                    ? `total ${formatEstimate(data.phase_estimates.total)}`
                    : undefined
                }
              />

              {data.group && (
                <StatTile
                  icon={Layers}
                  label="Group"
                  tone="brand"
                  value={data.group}
                  sub={
                    [data.level, data.point ? `${formatNumber(data.point)} pts` : '']
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                />
              )}

              {data.leader_deadline && (
                <StatTile
                  icon={CalendarRange}
                  label="Leader approval"
                  tone={data.leader_appr_overdue ? 'danger' : 'default'}
                  value={data.leader_deadline_human || '—'}
                  sub={data.leader_appr_overdue ? 'Overdue' : undefined}
                />
              )}

              {data.owner_deadline && (
                <StatTile
                  icon={CalendarRange}
                  label="Owner approval"
                  tone={data.owner_appr_overdue ? 'danger' : 'default'}
                  value={data.owner_deadline_human || '—'}
                  sub={data.owner_appr_overdue ? 'Overdue' : undefined}
                />
              )}

              {data.today_allocation > 0 && (
                <StatTile icon={Clock} label="Today" tone="brand" value={formatEstimate(data.today_allocation)} sub="allocated" />
              )}
            </div>

            {/* Focus button */}
            <button
              onClick={openFocus}
              className={clsx(
                'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition hover:brightness-105',
                focusActive
                  ? focusOver
                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                    : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'bg-brand-600 text-white hover:bg-brand-700',
              )}
            >
              <Timer className="h-4 w-4" />
              {focusActive ? (
                <>
                  {focus.timer?.status === 'paused' ? 'Resume focus' : 'Open focus'}
                  <span className="font-mono tabular-nums">
                    {focusOver ? '+' : ''}
                    {formatClock(focusValueMs)}
                  </span>
                </>
              ) : (
                'Focus mode'
              )}
            </button>

            {/* Day allocations — editable for assignee, read-only for others */}
            {data.is_mine ? (
              <AllocationCard data={data} />
            ) : (
              (data.allocations ?? []).length > 0 && (
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    <CalendarRange className="h-4 w-4" /> Day split
                  </p>
                  <div className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
                    {(data.allocations ?? []).map((a, i) => (
                      <div key={i}>
                        <div className="flex justify-between">
                          <span>{a.date}</span>
                          <span className="font-medium">{a.minutes}m</span>
                        </div>
                        {a.note && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{a.note}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Workflow */}
            <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Workflow
              </p>
              <Stepper current={data.status_key} />

              {data.status_key === 'cancelled' ? (
                <div className="mt-5 space-y-3">
                  {data.cancellation_reason && (
                    <p className="rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                      Reason: {data.cancellation_reason}
                    </p>
                  )}
                  {data.can_edit && (
                    <button
                      onClick={onRestore}
                      disabled={restoreTodo.isPending}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-700 py-3 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 disabled:opacity-60"
                    >
                      {restoreTodo.isPending ? <Spinner className="h-5 w-5" /> : <RotateCcw className="h-4 w-4" />}
                      Restore to Planned
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {data.status_key !== 'completed' &&
                    (data.can_advance ? (
                      <button
                        onClick={onAdvance}
                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700"
                      >
                        {data.next_status_label}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 py-3 text-sm text-slate-400 dark:text-slate-500">
                        <Lock className="h-4 w-4" />
                        Waiting on someone else to advance this
                      </div>
                    ))}

                  {data.can_edit && data.status_key !== 'completed' &&
                    (showCancel ? (
                      <div className="mt-3 space-y-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 p-3">
                        <textarea
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          rows={2}
                          placeholder="Reason (optional)"
                          className="w-full resize-none rounded-lg border border-rose-200 dark:border-rose-500/30 bg-transparent px-3 py-2 text-sm outline-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={onCancel}
                            disabled={cancelTodo.isPending}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                          >
                            {cancelTodo.isPending ? <Spinner className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                            Confirm cancel
                          </button>
                          <button
                            onClick={() => {
                              setShowCancel(false)
                              setCancelReason('')
                            }}
                            className="rounded-lg bg-white dark:bg-slate-700 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-200"
                          >
                            Back
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowCancel(true)}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-800 py-2.5 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 dark:ring-rose-500/30 hover:bg-rose-50"
                      >
                        <Ban className="h-4 w-4" /> Cancel task
                      </button>
                    ))}
                </>
              )}
            </div>

            {/* Recurrence history */}
            {data.occurrences.length > 1 && (
              <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <Repeat className="h-3.5 w-3.5" /> Recurrence history ({data.occurrences.length})
                </p>
                <ol className="space-y-1.5">
                  {data.occurrences.map((o) => {
                    const meta = STATUS[o.status_key]
                    return (
                      <li key={o.name}>
                        <Link
                          to={o.is_current ? '#' : `/project-item/${encodeURIComponent(o.name)}`}
                          onClick={(e) => o.is_current && e.preventDefault()}
                          className={clsx(
                            'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition',
                            o.is_current
                              ? 'bg-brand-50 dark:bg-brand-500/15 ring-1 ring-brand-200'
                              : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-700',
                          )}
                        >
                          <span>{meta.emoji}</span>
                          <span className="flex-1 text-slate-600 dark:text-slate-300">
                            {o.deadline_human || '—'}
                          </span>
                          {o.is_current ? (
                            <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                              This one
                            </span>
                          ) : (
                            <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-medium', meta.pill)}>
                              {meta.label}
                            </span>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="space-y-5">
            {/* Notes */}
            <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <FileText className="h-3.5 w-3.5" /> Notes
              </p>
              <Notes todoId={data.name} initial={data.notes} canEdit={data.can_edit_notes} />
            </div>

            {/* Dependencies */}
            {(data.blocked_by.length > 0 || data.blocking.length > 0) && (
              <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <Link2 className="h-3.5 w-3.5" /> Dependencies
                </p>
                <DepGroup
                  icon={ArrowDownLeft}
                  label="Blocked by"
                  tone="rose"
                  items={data.blocked_by}
                  resolve={(id) => data.detail_todos.find((t) => t.name === id)?.to_do ?? id}
                />
                <DepGroup
                  icon={ArrowUpRight}
                  label="Blocking"
                  tone="amber"
                  items={data.blocking}
                  resolve={(id) => data.detail_todos.find((t) => t.name === id)?.to_do ?? id}
                />
              </div>
            )}

            {/* Timeline */}
            {data.timeline.length > 0 && (
              <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <History className="h-3.5 w-3.5" /> Activity
                </p>
                <ol className="space-y-3">
                  {data.timeline.map((e, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="text-sm">
                        <p className="font-medium text-slate-700 dark:text-slate-200">
                          {e.label}{' '}
                          <span className="font-normal text-slate-400 dark:text-slate-500">by {e.by_name}</span>
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{e.at_human}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Comments */}
            <CommentThread referenceDoctype="Project Todo" referenceName={todoName} />
          </div>
        </div>
      )}
    </div>
  )
}
