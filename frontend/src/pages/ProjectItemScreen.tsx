import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertCircle,
  ArrowDown,
  ArrowDownLeft,
  ArrowUp,
  ListChecks,
  ArrowRight,
  ArrowUpRight,
  Ban,
  MoreVertical,
  CalendarCheck,
  CalendarDays,
  Check,
  Clock,
  Copy,
  CornerDownRight,
  UserCheck,
  FileText,
  FolderKanban,
  History,
  Link2,
  Lock,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Save,
  Trash2,
  AlertTriangle,
  CircleCheck,
  CalendarRange,
  Layers,
  Target,
  Timer,
  StickyNote,
  X,
  Zap,
  Eye,
} from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { CancelledNote } from '@/components/CancelledNote'
import { Avatar, FullScreenLoader, EmptyState, Spinner } from '@/components/ui'
import CommentThread from '@/components/CommentThread'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { openFocusOverlay } from '@/lib/focusUI'
import { todoFileHref } from '@/lib/api'
import { STATUS, STATUS_ORDER } from '@/lib/status'
import { formatClock, formatEstimate, dateSub, stripHtml, todayISO } from '@/lib/format'
import { useProjectItem, useSaveNotes, useSaveChecklist, useUpdateTodo, useSetTodoAllocations, useSetAssignedAllocation, useCancelTodo, useRestoreTodo, useDeleteTodo, useUploadTodoFile, useDeleteTodoFile, useSetAutoApprove, useBoot, useFocusMode } from '@/hooks/useData'
import type { ChecklistItem } from '@/lib/types'
import { GroupLevelPicker } from '@/components/GroupLevelPicker'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useAdvance } from '@/components/AdvanceProvider'
import { useReject } from '@/components/RejectProvider'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { AssignmentOverloadBanner } from '@/components/AssignmentOverloadBanner'
import { CreateProjectItemSheet } from '@/components/CreateProjectItemSheet'
import { FocusNoteSheet } from '@/components/FocusNoteSheet'
import { AutoApproveSegment } from '@/components/AutoApproveSegment'
import { todoDuplicateInitial, todoFollowUpInitial } from '@/lib/duplicateTodo'
import { FollowUpCheckDialog } from '@/components/FollowUpCheckDialog'
import { ISSUE_HELP, issueCounts, issueLabel, todoIssueInitial } from '@/lib/todoIssues'
import { HelpSheet, InfoDot } from '@/components/HelpSheet'
import type { ProjectItemDetail, TodoFile } from '@/lib/types'
import { recurrenceFromDetail, serializeRecurrence, summarizeRecurrence, type Recurrence } from '@/lib/recurrence'
import { RecurrenceEditor } from '@/components/RecurrenceEditor'

function Stepper({ current }: { current: string }) {
  const idx = STATUS_ORDER.indexOf(current as any)
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

function EditForm({ data, onClose }: { data: ProjectItemDetail; onClose: () => void }) {
  const update = useUpdateTodo(data.name)
  const toast = useToast()
  const locked = data.fields_locked
  const [toDo, setToDo] = useState(data.to_do)
  const [assignee, setAssignee] = useState(data.assigned_to)
  const [mentor, setMentor] = useState(data.mentor ?? '')
  const [startDate, setStartDate] = useState(data.start_date ?? '')
  const [deadline, setDeadline] = useState(data.deadline ?? '')
  const [leaderDeadline, setLeaderDeadline] = useState(data.leader_deadline ?? '')
  const [ownerDeadline, setOwnerDeadline] = useState(data.owner_deadline ?? '')
  const [estimated, setEstimated] = useState(String(data.estimated || ''))
  const [pDC, setPDC] = useState(String(data.phase_estimates.done_to_checked || ''))
  const [pCC, setPCC] = useState(String(data.phase_estimates.checked_to_completed || ''))
  const [recurrence, setRecurrence] = useState<Recurrence>(() => recurrenceFromDetail(data.recurring))
  const [group, setGroup] = useState(data.group ?? '')
  const [level, setLevel] = useState(data.level_id ?? '')
  const [blockedBy, setBlockedBy] = useState<string[]>(data.blocked_by ?? [])
  const [blocking, setBlocking] = useState<string[]>(data.blocking ?? [])
  const [workMode, setWorkMode] = useState<'Human' | 'AI' | 'Both' | ''>(data.work_mode ?? '')

  const phaseTotal = (Number(pDC) || 0) + (Number(pCC) || 0)

  const team =
    data.team.some((m) => m.user === data.assigned_to) || !data.assigned_to
      ? data.team
      : [{ user: data.assigned_to, name: data.assigned_to_name, image: data.assigned_to_image }, ...data.team]

  const save = () => {
    if (update.isPending) return
    if (!group || !level) {
      toast('error', 'Group and type are required')
      return
    }
    if (!locked && !deadline) {
      toast('error', 'Deadline is required')
      return
    }
    if (!locked && !startDate) {
      toast('error', 'Start date is required')
      return
    }
    if (!locked && startDate && deadline && startDate > deadline) {
      toast('error', 'Start date cannot be after the deadline')
      return
    }
    const fields: Record<string, unknown> = { to_do: toDo }
    if (!locked) {
      fields.assigned_to = assignee
      fields.start_date = startDate
      fields.deadline = deadline
      if (data.can_edit_estimate) {
        fields.estimated = estimated === '' ? 0 : Number(estimated)
      }
    }
    // Mentor credit is leader/owner-set (backend re-checks). Empty clears it.
    if (data.can_edit_estimate) {
      fields.mentor = mentor
    }
    // Approval-phase estimates in minutes (summed into the task total server-side).
    // Planned→Done is the main `estimated` field above.
    fields.estimated_done_to_checked = Number(pDC) || 0
    fields.estimated_checked_to_completed = Number(pCC) || 0
    // Recurring settings
    Object.assign(fields, serializeRecurrence(recurrence))
    // Optional approval-phase deadlines (editable regardless of lock; empty clears).
    fields.leader_deadline = leaderDeadline || ''
    fields.owner_deadline = ownerDeadline || ''
    fields.group = group
    fields.level_id = level
    fields.work_mode = workMode
    // Blocking links: arrays of todo names (controller syncs the mirror side).
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

  const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-[15px] text-slate-800 dark:text-slate-100 outline-none transition focus:border-brand-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-brand-100 disabled:opacity-60 dark:placeholder-slate-500'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Edit todo</h3>
        <button onClick={onClose} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
          <X className="h-5 w-5" />
        </button>
      </div>

      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Title</label>
      <textarea
        value={toDo}
        onChange={(e) => setToDo(e.target.value)}
        rows={2}
        className={clsx(field, 'mb-3 resize-none')}
      />

      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Assigned to</label>
      <div className="mb-3">
        <SearchableSelect
          value={assignee}
          disabled={locked}
          onChange={setAssignee}
          options={team.map((m) => ({ value: m.user, label: m.name }))}
          placeholder="Select a team member…"
        />
      </div>
      <AssignmentOverloadBanner
        user={assignee}
        date={deadline}
        minutes={estimated === '' ? 0 : Number(estimated)}
        enabled={assignee !== data.assigned_to}
      />

      {data.can_edit_estimate && (
        <>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Mentor <span className="font-normal text-slate-400">· optional, earns a share for coaching</span>
          </label>
          <div className="mb-3">
            <SearchableSelect
              value={mentor}
              onChange={setMentor}
              options={[
                { value: '', label: '— No mentor —' },
                ...(data.mentor && !team.some((m) => m.user === data.mentor)
                  ? [{ value: data.mentor, label: data.mentor_name || data.mentor }]
                  : []),
                ...team.filter((m) => m.user !== assignee).map((m) => ({ value: m.user, label: m.name })),
              ]}
              placeholder="Who helped on this task?"
            />
          </div>
        </>
      )}

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Start date</label>
        <input
          type="date"
          value={startDate}
          disabled={locked}
          onChange={(e) => setStartDate(e.target.value)}
          className={field}
        />
      </div>

      <div className="mb-3 flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Deadline</label>
          <input
            type="date"
            value={deadline}
            disabled={locked}
            onChange={(e) => setDeadline(e.target.value)}
            className={field}
          />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Est. (min)</label>
          {data.can_edit_estimate ? (
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={estimated}
              disabled={locked}
              onChange={(e) => setEstimated(e.target.value)}
              className={field}
            />
          ) : (
            <p className="py-2.5 text-sm text-slate-500 dark:text-slate-400">{data.estimated}m (leader-set)</p>
          )}
        </div>
      </div>

      {/* Approval phases — each: deadline + estimated time for that step */}
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
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Deadline</span>
                <input
                  type="date"
                  value={p.date}
                  onChange={(e) => p.setDate(e.target.value)}
                  className={clsx(field, 'min-w-0')}
                />
              </div>
              <div className="w-24 shrink-0">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Est.</span>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step="1"
                    value={p.est}
                    placeholder="0"
                    onChange={(e) => p.setEst(e.target.value)}
                    className={clsx(field, 'pr-7 text-right')}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">m</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recurring */}
      <div className="mb-3">
        <RecurrenceEditor value={recurrence} onChange={setRecurrence} />
      </div>

      <div className="mb-3">
        <GroupLevelPicker
          value={{ group, typeName: '', levelId: level }}
          onChange={(v) => { setGroup(v.group); setLevel(v.levelId) }}
          estimated={estimated}
        />
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Work mode <span className="font-normal text-slate-400">· siapa yang kerjakan</span></label>
        <div className="flex gap-2">
          {(['Human', 'AI', 'Both'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setWorkMode(workMode === m ? '' : m)}
              className={clsx(
                'flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition active:scale-95',
                workMode === m
                  ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/60 dark:bg-brand-500/20 dark:text-brand-300'
                  : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
              )}
            >
              {m === 'Human' ? 'Human' : m === 'AI' ? 'AI' : 'Both'}
            </button>
          ))}
        </div>
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
          Assignee, start date, deadline &amp; estimate are locked once a todo is Done.
        </p>
      )}

      {/* Assigned plan (leader/SM-editable) — moved here from the detail view */}
      {data.can_edit_assigned && <AssignedAllocationCard data={data} />}

      <div className="mt-4 flex gap-2">
        <button
          onClick={onClose}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700"
        >
          <X className="h-4 w-4" /> Cancel
        </button>
        <button
          onClick={save}
          disabled={update.isPending || !toDo.trim()}
          className="flex flex-[2] items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-50"
        >
          {update.isPending ? <Spinner className="h-4 w-4" /> : <><Save className="h-4 w-4" /> Save changes</>}
        </button>
      </div>
      </div>
    </div>
  )
}

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
            className="inline-flex max-w-full items-center rounded-lg bg-slate-100 dark:bg-slate-700/60 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-700"
          >
            <span className="truncate">{resolve(id)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** Issues raised on this todo. Each one IS a todo (own assignee, deadline and points)
 *  that points back here, so a row is a link, not an inline editor. Resolved means the
 *  issue's own todo reached Completed — done AND approved. */
function Issues({
  data, onReport, onHelp,
}: {
  data: ProjectItemDetail
  onReport: () => void
  onHelp: (term: string) => void
}) {
  const counts = issueCounts(data.issues)
  const open = data.issues.filter((i) => !i.resolved && i.status_key !== 'cancelled')
  const rest = data.issues.filter((i) => i.resolved || i.status_key === 'cancelled')
  const rows = [...open, ...rest] // unresolved first — that is the part that needs work

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <AlertTriangle className={clsx('h-3.5 w-3.5', counts.open > 0 && 'text-amber-500')} /> Issues
          <InfoDot term="apa-itu" onOpen={onHelp} label="Apa itu issue" />
        </p>
        {data.can_report_issue && (
          <button
            onClick={onReport}
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 transition active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" /> Report
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          No issues on this todo.
          {data.can_report_issue
            ? ' Found something that needs fixing? Report it as its own task.'
            : ''}
        </p>
      ) : (
        <>
          <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {issueLabel(counts)}
            <InfoDot term="kapan-selesai" onOpen={onHelp} label="Kapan issue dihitung selesai" />
          </p>
          <ul className="space-y-1.5">
            {rows.map((i) => {
              const meta = STATUS[i.status_key]
              return (
                <li key={i.name}>
                  <Link
                    to={`/project-item/${encodeURIComponent(i.name)}`}
                    className={clsx(
                      'flex items-start gap-2 rounded-xl px-3 py-2 text-left transition active:scale-[0.99]',
                      i.resolved
                        ? 'bg-emerald-50 dark:bg-emerald-500/10'
                        : i.status_key === 'cancelled'
                          ? 'bg-slate-50 dark:bg-slate-800/60 opacity-70'
                          : 'bg-amber-50 dark:bg-amber-500/10',
                    )}
                  >
                    {i.resolved ? (
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : i.status_key === 'cancelled' ? (
                      <Ban className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={clsx(
                          'block text-sm font-medium text-slate-800 dark:text-slate-100',
                          i.status_key === 'cancelled' && 'line-through',
                        )}
                      >
                        {i.to_do}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                        {i.assigned_to_name}
                        {i.resolved
                          ? ` · resolved ${i.resolved_at_human ?? ''}`.trimEnd()
                          : i.deadline_human
                            ? ` · due ${i.deadline_human}`
                            : ''}
                      </span>
                    </span>
                    <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', meta.pill)}>
                      {i.resolved ? 'Resolved' : meta.label}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}

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
        className="w-full resize-none [field-sizing:content] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200 outline-none transition focus:border-brand-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-brand-100 dark:placeholder-slate-500"
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
          <span>Tap outside to save</span>
        ) : null}
      </div>
    </div>
  )
}

function Checklist({ todoId, initial, canEdit }: { todoId: string; initial: ChecklistItem[]; canEdit: boolean }) {
  const save = useSaveChecklist(todoId)
  const toast = useToast()
  const [items, setItems] = useState<ChecklistItem[]>(initial ?? [])
  const [newItem, setNewItem] = useState('')
  const baseline = useRef(JSON.stringify(initial ?? []))

  // Adopt server state only when we have no pending local divergence — mirrors <Notes>.
  useEffect(() => {
    if (baseline.current === JSON.stringify(items)) {
      setItems(initial ?? [])
      baseline.current = JSON.stringify(initial ?? [])
    }
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: ChecklistItem[]) => {
    setItems(next)
    baseline.current = JSON.stringify(next) // adopt now so the refetch doesn't clobber optimistic state
    save.mutate(next, { onError: (err) => toast('error', (err as Error).message) })
  }

  const done = items.filter((i) => i.d).length
  const addItem = () => {
    const t = newItem.trim()
    if (!t) return
    commit([...items, { t, d: false }])
    setNewItem('')
  }
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= items.length) return
    const next = items.slice()
    ;[next[idx], next[j]] = [next[j], next[idx]]
    commit(next)
  }

  // Read-only: static checked list. ponytail: no edit affordances when !canEdit.
  if (!canEdit) {
    if (!items.length) return <p className="text-sm italic text-slate-400 dark:text-slate-500">No checklist.</p>
    return (
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            {it.d ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="inline-block h-4 w-4 rounded border border-slate-300 dark:border-slate-600" />}
            <span className={it.d ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}>{it.t}</span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div>
      {items.length > 0 && (
        <ul className="mb-2 flex flex-col gap-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={it.d}
                onChange={() => commit(items.map((x, j) => (j === i ? { ...x, d: !x.d } : x)))}
                className="h-5 w-5 accent-brand-600"
              />
              <input
                value={it.t}
                readOnly={it.d}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))}
                onBlur={() => { if (JSON.stringify(items) !== baseline.current) commit(items) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                className={'flex-1 bg-transparent text-sm outline-none ' + (it.d ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-800 dark:text-slate-100')}
              />
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="text-slate-400 disabled:opacity-30 active:scale-90">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="text-slate-400 disabled:opacity-30 active:scale-90">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button onClick={() => commit(items.filter((_, j) => j !== i))} aria-label="Remove item" className="text-rose-500 active:scale-90">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-brand-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-brand-100"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addItem()
            }
          }}
          placeholder="Tambah item checklist"
        />
        <button
          onClick={addItem}
          disabled={!newItem.trim()}
          aria-label="Add item"
          className="flex shrink-0 items-center justify-center rounded-xl bg-brand-600 px-3 text-white active:scale-95 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {items.length > 0 && (
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{done}/{items.length} selesai</p>
      )}
    </div>
  )
}

function fmtFileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Files({ todoId, files, canEdit }: { todoId: string; files: TodoFile[]; canEdit: boolean }) {
  const up = useUploadTodoFile(todoId)
  const del = useDeleteTodoFile(todoId)
  const toast = useToast()
  const confirm = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files
    if (!picked || !picked.length) return
    const list = Array.from(picked)
    e.target.value = '' // let the same file be re-picked later
    let ok = 0
    for (const f of list) {
      try {
        await up.mutateAsync(f)
        ok++
      } catch (err) {
        toast('error', (err as Error).message)
        break
      }
    }
    if (ok) toast('success', ok > 1 ? `${ok} files uploaded` : 'File uploaded')
  }

  const onDelete = async (f: TodoFile) => {
    const yes = await confirm({
      title: 'Delete file?',
      message: f.file_name,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!yes) return
    del.mutate(f.name, {
      onSuccess: () => toast('success', 'File deleted'),
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  return (
    <div className="space-y-2">
      {files.length === 0 && (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">No files yet.</p>
      )}
      {files.map((f) => (
        <div
          key={f.name}
          className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2"
        >
          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
          <a
            href={todoFileHref(todoId, f)}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate text-sm text-brand-600 hover:underline dark:text-brand-400"
          >
            {f.file_name}
          </a>
          {f.file_size ? (
            <span className="shrink-0 text-xs text-slate-400">{fmtFileSize(f.file_size)}</span>
          ) : null}
          {canEdit && (
            <button
              onClick={() => onDelete(f)}
              className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700"
              aria-label={`Delete ${f.file_name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <div>
          <input ref={inputRef} type="file" multiple hidden onChange={onPick} />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={up.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-400 hover:text-brand-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300"
          >
            {up.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {up.isPending ? 'Uploading…' : 'Add files'}
          </button>
        </div>
      )}
    </div>
  )
}

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
    tone === 'danger' ? 'text-rose-700 dark:text-rose-300' : tone === 'brand' ? 'text-brand-700 dark:text-brand-300' : 'text-slate-800 dark:text-slate-100'
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

  const [saved, setSaved] = useState(false)

  // Autosave: debounce row edits and persist. Rows with minutes but no date are
  // invalid — skip the save (no toast spam) until the date is filled in. Empty
  // rows are filtered out server-side; they stay in local state for editing.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    if (rows.some((r) => !r.date && Number(r.minutes) > 0)) return
    const clean = rows.filter((r) => r.date)
    const t = setTimeout(() => {
      save.mutate(clean, {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        },
        onError: (e) => toast('error', (e as Error).message),
      })
    }, 800)
    return () => clearTimeout(t)
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <CalendarRange className="h-4 w-4" /> My day plan
        </p>
        <span className="rounded-full bg-brand-50 dark:bg-brand-500/15 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:text-brand-300">
          {total}m
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-2">
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
              <button onClick={() => removeRow(i)} className="shrink-0 rounded-lg p-1.5 text-rose-600 active:bg-rose-50 dark:active:bg-rose-500/15">
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
          <p className="py-1 text-center text-xs text-slate-400 dark:text-slate-500">No day split yet — add a day to plan your time.</p>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={addRow}
          className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700"
        >
          <Plus className="h-4 w-4" /> Add day
        </button>
        <span className="flex h-5 items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          {save.isPending ? (
            <><Spinner className="h-3 w-3" /> Saving…</>
          ) : saved ? (
            <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="h-3.5 w-3.5" /> Saved</span>
          ) : null}
        </span>
      </div>
    </div>
  )
}

function AssignedAllocationCard({ data }: { data: ProjectItemDetail }) {
  const save = useSetAssignedAllocation(data.name)
  const toast = useToast()
  const [rows, setRows] = useState<AllocRow[]>(
    (data.assigned_allocation ?? []).map((a) => ({ date: a.date, minutes: a.minutes, note: a.note ?? '' })),
  )

  const total = rows.reduce((s, r) => s + (Number(r.minutes) || 0), 0)
  const field =
    'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-2.5 py-2 text-sm focus:border-brand-600 focus:outline-none dark:placeholder-slate-500'

  const addRow = () => setRows((r) => [...r, { date: '', minutes: 0, note: '' }])
  const removeRow = (i: number) => setRows((r) => r.filter((_, j) => j !== i))
  const setRow = (i: number, patch: Partial<AllocRow>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const onSave = () => {
    if (rows.some((r) => !r.date && Number(r.minutes) > 0)) {
      toast('error', 'Add a date to every allocation row')
      return
    }
    if (data.estimated > 0 && total > data.estimated) {
      toast('error', `${total - data.estimated}m over the ${data.estimated}m estimate`)
      return
    }
    const clean = rows.filter((r) => r.date)
    save.mutate(clean, {
      onSuccess: () => toast('success', 'Assigned plan saved'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  const alloc = data.assigned_allocation ?? []

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <CalendarRange className="h-4 w-4" /> Assigned plan
        </p>
        <span
          className={
            'rounded-full px-2 py-0.5 text-[11px] font-bold ' +
            (!data.estimated
              ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300'
              : total <= data.estimated
                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300')
          }
        >
          {total}m{data.estimated ? ` / ${data.estimated}m est` : ''}
        </span>
      </div>

      {data.can_edit_assigned ? (
        <>
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-2">
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
                  <button onClick={() => removeRow(i)} className="shrink-0 rounded-lg p-1.5 text-rose-600 active:bg-rose-50 dark:active:bg-rose-500/15">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input
                  type="text"
                  value={r.note}
                  placeholder="Note…"
                  onChange={(e) => setRow(i, { note: e.target.value })}
                  className={field + ' w-full'}
                />
              </div>
            ))}
            {!rows.length && (
              <p className="py-1 text-center text-xs text-slate-400 dark:text-slate-500">No assigned plan yet — add a day.</p>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={addRow}
              className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700"
            >
              <Plus className="h-4 w-4" /> Add day
            </button>
            <button
              onClick={onSave}
              disabled={save.isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-60"
            >
              {save.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save plan
            </button>
          </div>
        </>
      ) : (
        alloc.length > 0 ? (
          <div className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
            {alloc.map((a, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between">
                    <span>{a.date}</span>
                    <span className="font-medium">{a.minutes}m</span>
                  </div>
                  {a.note && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{a.note}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-1 text-center text-xs text-slate-400 dark:text-slate-500">No assigned plan yet.</p>
        )
      )}
    </div>
  )
}

type TopItem = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

// Compact ⋮ overflow menu for the DetailScreen topbar (Duplicate/Cancel/Delete).
function TopMenu({ items }: { items: TopItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  if (!items.length) return null
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 transition active:scale-90 active:bg-slate-100 dark:active:bg-slate-700"
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-48 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick() }}
              className={clsx(
                'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition active:bg-slate-50 dark:active:bg-slate-700/60 disabled:opacity-50',
                it.danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200',
              )}
            >
              <it.icon className="h-4 w-4 shrink-0" /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProjectItemScreen() {
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const id = decodeURIComponent(name)
  const { data, isLoading } = useProjectItem(id)
  const { data: boot } = useBoot()
  const advanceConfirm = useAdvance()
  const rejectConfirm = useReject()
  const cancelTodo = useCancelTodo()
  const restoreTodo = useRestoreTodo()
  const deleteTodo = useDeleteTodo()
  const setAutoApprove = useSetAutoApprove()
  const setDeadlineToday = useUpdateTodo(id)
  const setWaiting = useUpdateTodo(id)
  const setPriority = useUpdateTodo(id)
  const setCheck = useUpdateTodo(id)
  const confirm = useConfirm()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [showWaiting, setShowWaiting] = useState(false)
  const [showFocusNote, setShowFocusNote] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
const [followOpen, setFollowOpen] = useState(false)
  const [checkOpen, setCheckOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueHelpTerm, setIssueHelpTerm] = useState<string | null>(null)
  const [waitingReason, setWaitingReason] = useState('')
  const focus = useFocusTimer(id)
  const focusMode = useFocusMode()

  // Deep-link intents (from a context menu): open the matching form once, then
  // strip the query so refresh/back doesn't re-trigger.
  useEffect(() => {
    if (searchParams.get('edit')) setEditing(true)
    else if (searchParams.get('duplicate')) setDupOpen(true)
    else if (searchParams.get('issue')) setIssueOpen(true)
    else if (searchParams.get('check')) setCheckOpen(true)
    else return
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  if (isLoading && !data) {
    return (
      <DetailScreen title="Todo">
        <FullScreenLoader />
      </DetailScreen>
    )
  }
  if (!data) {
    return (
      <DetailScreen title="Todo">
        <EmptyState icon={AlertCircle} title="Couldn't load todo" />
      </DetailScreen>
    )
  }

  const onAdvance = () => {
    if (data.next_status_label) advanceConfirm(data.name, data.next_status_label, data.to_do)
  }

  const onReject = () => rejectConfirm(data.name, data.to_do)

  const onSetAutoApprove = (mode: 'on' | 'off' | 'inherit') => {
    if (!data || setAutoApprove.isPending) return
    setAutoApprove.mutate(
      { todoId: data.name, mode },
      { onError: (err) => toast('error', (err as Error).message) },
    )
  }

  const onCancel = async () => {
    const reason = await confirm({
      title: 'Cancel this task?',
      message: 'It moves to Cancelled. You can Restore it to Planned later.',
      destructive: true,
      confirmLabel: 'Cancel task',
      cancelLabel: 'Keep it',
      input: { placeholder: 'Reason (optional)', rows: 2 },
    })
    if (reason === null) return
    try {
      const res = await cancelTodo.mutateAsync({ projectItem: data.name, reason: reason.trim() || undefined })
      toast(res.status === 'ok' ? 'success' : 'info', res.message)
    } catch (e: any) {
      toast('error', e?.message || 'Cancel failed')
    }
  }

  const onRestore = async () => {
    const ok = await confirm({ title: 'Restore this task to Planned?', confirmLabel: 'Restore' })
    if (!ok) return
    try {
      const res = await restoreTodo.mutateAsync(data.name)
      toast(res.status === 'ok' ? 'success' : 'info', res.message)
    } catch (e: any) {
      toast('error', e?.message || 'Restore failed')
    }
  }

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete this task?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await deleteTodo.mutateAsync(data.name)
      toast(res.status === 'ok' ? 'success' : 'info', res.message ?? '')
      if (res.status === 'ok') navigate(-1)
    } catch (e: any) {
      toast('error', e?.message || 'Delete failed')
    }
  }

  // Quick action for leads/assignee: pull a slipping deadline forward to today.
  const onDeadlineToday = () => {
    if (setDeadlineToday.isPending) return
    setDeadlineToday.mutate(
      { deadline: todayISO() },
      {
        onSuccess: () => toast('success', 'Deadline set to today'),
        onError: (err) => toast('error', (err as Error).message),
      },
    )
  }
  const canSetDeadlineToday =
    data.can_edit && !data.fields_locked && data.status_key !== 'cancelled' && data.deadline !== todayISO()

  // Leaders spend one of the assignee's daily priority slots. The controller owns
  // the caps; a refusal comes back as a Bahasa message naming the person and date.
  const onTogglePriority = () => {
    if (setPriority.isPending) return
    const next = data.is_priority ? 0 : 1
    setPriority.mutate(
      { is_priority: next },
      {
        onSuccess: () => toast('success', next ? 'Dijadikan prioritas hari itu' : 'Prioritas dilepas'),
        onError: (err) => toast('error', (err as Error).message),
      },
    )
  }

  // Assignee's own "still needs checking" reminder — plain flag, no scoring/workflow effect.
  const onToggleCheck = () => {
    if (setCheck.isPending) return
    const next = data.to_check ? 0 : 1
    setCheck.mutate(
      { to_check: next },
      {
        onSuccess: () => toast('success', next ? 'Ditandai perlu dicek' : 'Tanda cek dilepas'),
        onError: (err) => toast('error', (err as Error).message),
      },
    )
  }

  const onMarkWaiting = () => {
    if (setWaiting.isPending || !waitingReason.trim()) return
    setWaiting.mutate(
      { is_waiting: 1, waiting_reason: waitingReason.trim() },
      {
        onSuccess: () => { setShowWaiting(false); setWaitingReason(''); toast('success', 'Marked as waiting') },
        onError: (err) => toast('error', (err as Error).message),
      },
    )
  }
  const onResume = () => {
    if (setWaiting.isPending) return
    setWaiting.mutate(
      { is_waiting: 0 },
      {
        onSuccess: () => toast('success', 'Resumed'),
        onError: (err) => toast('error', (err as Error).message),
      },
    )
  }
  // Parking is only meaningful while the todo is still Planned and editable.
  const canWait = data.can_edit && data.status_key === 'planned'

  const editBtn =
    data.can_edit && !editing ? (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 rounded-full bg-brand-50 dark:bg-brand-500/15 px-3.5 py-2 text-sm font-semibold text-brand-700 dark:text-brand-300 transition active:scale-95"
      >
        <Pencil className="h-4 w-4" /> Edit
      </button>
    ) : null

  const topActions = (
    <div className="flex items-center gap-1.5">
      {editBtn}
      <TopMenu
        items={[
          ...(data.can_prioritize && data.status_key !== 'cancelled' && (boot?.settings?.daily_priority_slots ?? 0) > 0
            ? [
                {
                  label: data.is_priority ? 'Lepas prioritas' : 'Jadikan prioritas',
                  icon: Zap,
                  onClick: onTogglePriority,
                  disabled: setPriority.isPending,
                },
              ]
            : []),
          ...(data.is_mine && data.status_key !== 'cancelled'
            ? [
                {
                  label: data.to_check ? 'Lepas tanda cek' : 'Tandai perlu dicek',
                  icon: Eye,
                  onClick: onToggleCheck,
                  disabled: setCheck.isPending,
                },
              ]
            : []),
          ...(data.can_create
            ? [
                { label: 'Duplicate task', icon: Copy, onClick: () => setDupOpen(true) },
                { label: 'Add follow-up todo', icon: CornerDownRight, onClick: () => setFollowOpen(true) },
                { label: 'Minta orang lain cek…', icon: UserCheck, onClick: () => setCheckOpen(true) },
              ]
            : []),
          ...(canSetDeadlineToday
            ? [{ label: 'Set deadline to today', icon: CalendarCheck, onClick: onDeadlineToday, disabled: setDeadlineToday.isPending }]
            : []),
          ...(data.can_edit && data.status_key !== 'completed' && data.status_key !== 'cancelled'
            ? [{ label: 'Cancel task', icon: Ban, danger: true, onClick: onCancel }]
            : []),
          ...(data.can_delete
            ? [{ label: 'Delete task', icon: Trash2, danger: true, onClick: onDelete, disabled: deleteTodo.isPending }]
            : []),
        ]}
      />
    </div>
  )

  const focusActive = focus.timer != null
  const openFocus = () => {
    if (!focusActive)
      focus.start(data.name, data.to_do, data.estimated, {
        project: data.project_name,
        deadlineHuman: data.deadline_human || undefined,
        overdue: data.is_overdue,
        estimateLabel: data.estimated > 0 ? formatEstimate(data.estimated) : undefined,
        group: data.group
          ? [
              data.group,
              data.level_type && data.level
                ? `${data.level_type} · ${data.level}`
                : data.level_type || data.level,
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined,
      })
    // inline mode: the timer shows inline on this screen; the FAB opens the overlay.
    if (focusMode === 'fullscreen') openFocusOverlay(data.name)
  }
  // Active overtime only matters with a real estimate; a no-estimate timer just
  // counts up and never goes "over".
  const focusOver = focusActive && focus.hasEstimate && focus.remainingMs < 0
  const focusValueMs = focusActive ? (focus.hasEstimate ? focus.remainingMs : focus.elapsedMs) : 0

  return (
    <DetailScreen title="Todo" right={topActions}>
      {editing && <EditForm data={data} onClose={() => setEditing(false)} />}
      {data.status_key === 'cancelled' && (
        <div className="mb-3">
          <CancelledNote item={data} />
        </div>
      )}
      {data.issue_of && (
        <Link
          to={`/project-item/${encodeURIComponent(data.issue_of)}`}
          className="mb-3 flex items-center gap-2 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 transition active:scale-[0.99]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Issue on
            </span>
            <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
              {data.issue_of_title ?? data.issue_of}
            </span>
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            {data.status_key === 'completed' ? 'Resolved' : 'Open'}
          </span>
        </Link>
      )}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {data.project_name}
          </p>
          <Link
            to={`/project-detail/${encodeURIComponent(data.project_detail)}`}
            className="text-sm text-brand-600 dark:text-brand-400"
          >
            in {data.project_detail_title}
          </Link>
          <h2 className="mt-1 text-lg font-bold leading-snug text-slate-900 dark:text-slate-50">{data.to_do}</h2>

          {(data.is_missed || data.recurring.is_recurring || data.phase_estimates.total > 0 || data.is_waiting) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {data.is_missed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                  <AlertCircle className="h-3.5 w-3.5" /> Missed occurrence
                </span>
              )}
              {data.recurring.is_recurring && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300">
                  <Repeat className="h-3.5 w-3.5" /> {summarizeRecurrence(recurrenceFromDetail(data.recurring))}
                </span>
              )}
              {data.phase_estimates.total > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 dark:bg-brand-500/20 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
                  <Clock className="h-3.5 w-3.5" /> {formatEstimate(data.phase_estimates.total)} total
                </span>
              )}
              {data.is_waiting && (
                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 dark:bg-yellow-500/15 px-2.5 py-1 text-xs font-semibold text-yellow-800 dark:text-yellow-300">
                  <Pause className="h-3.5 w-3.5" /> Waiting{data.waiting_reason ? ` · ${data.waiting_reason}` : ''}
                </span>
              )}
            </div>
          )}
          {data.is_waiting && data.waiting_since && (
            <p className="mt-2 text-xs text-stone-500 dark:text-slate-400">
              Waiting since {data.waiting_since.slice(0, 10)}
              {data.waiting_by_name ? ` · set by ${data.waiting_by_name}` : ''}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <Target className="h-3 w-3 text-slate-400 dark:text-slate-500" /> Assignee
              </p>
              <div className="flex items-center gap-1.5">
                <Avatar name={data.assigned_to_name} image={data.assigned_to_image} config={data.assigned_to_avatar_config} size={20} />
                <span className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{data.assigned_to_name}</span>
              </div>
            </div>

            <StatTile
              icon={CalendarDays}
              label="Start date"
              value={data.start_date_human || '—'}
              sub={dateSub(data.start_date)}
            />

            <StatTile
              icon={CalendarDays}
              label="Deadline"
              tone={data.is_overdue ? 'danger' : 'default'}
              value={data.deadline_human || '—'}
              sub={dateSub(data.deadline, data.is_overdue && 'Overdue')}
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
                  [
                    data.level_type && data.level ? `${data.level_type} · ${data.level}` : (data.level_type || data.level),
                    data.point != null ? `${data.point} pts` : '',
                  ]
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
                sub={dateSub(data.leader_deadline, data.leader_appr_overdue && 'Overdue')}
              />
            )}

            {data.owner_deadline && (
              <StatTile
                icon={CalendarRange}
                label="Owner approval"
                tone={data.owner_appr_overdue ? 'danger' : 'default'}
                value={data.owner_deadline_human || '—'}
                sub={dateSub(data.owner_deadline, data.owner_appr_overdue && 'Overdue')}
              />
            )}

            {data.today_allocation > 0 && (
              <StatTile
                icon={Clock}
                label="Today"
                tone="brand"
                value={formatEstimate(data.today_allocation)}
                sub="allocated"
              />
            )}
          </div>

          {canWait && (data.is_waiting ? (
            <button
              onClick={onResume}
              disabled={setWaiting.isPending}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-500/30 active:bg-emerald-100 disabled:opacity-60"
            >
              <Play className="h-4 w-4" /> Resume
            </button>
          ) : (
            <button
              onClick={() => setShowWaiting(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-800 py-2.5 text-sm font-semibold text-stone-700 dark:text-slate-200 ring-1 ring-stone-200 dark:ring-slate-600 active:bg-stone-50"
            >
              <Pause className="h-4 w-4" /> Mark waiting
            </button>
          ))}

          <button
            onClick={openFocus}
            className={clsx(
              'mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition active:scale-[0.98]',
              focusActive
                ? focusOver
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                  : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'bg-brand-600 text-white active:bg-brand-700',
            )}
          >
            <Timer className="h-4 w-4" />
            {focusActive ? (
              <>
                {focusMode === 'inline'
                  ? focus.timer?.status === 'paused' ? 'Paused' : 'Focusing'
                  : focus.timer?.status === 'paused' ? 'Resume focus' : 'Open focus'}
                <span className="font-mono tabular-nums">
                  {focusOver ? '+' : ''}
                  {formatClock(focusValueMs)}
                </span>
              </>
            ) : (
              'Focus mode'
            )}
          </button>

          <button
            onClick={() => setShowFocusNote(true)}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-800 py-2.5 text-sm font-semibold text-stone-700 dark:text-slate-200 ring-1 ring-stone-200 dark:ring-slate-600 active:bg-stone-50"
          >
            <StickyNote className="h-4 w-4 text-brand-600" />
            {focus.note ? 'Edit focus note' : 'Add focus note'}
          </button>
          {focus.note && (
            <p className="mt-1.5 flex items-start gap-1.5 px-1 text-xs text-stone-500 dark:text-slate-400">
              <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-brand-500" />
              <span className="whitespace-pre-wrap">{focus.note}</span>
            </p>
          )}
        </div>

      {/* My day plan: editable for assignee, read-only for others */}
      {data.is_mine ? (
        <AllocationCard data={data} />
      ) : (
        (data.allocations ?? []).length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <CalendarRange className="h-4 w-4" /> My day plan
            </p>
            <div className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              {(data.allocations ?? []).map((a, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                    <FolderKanban className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <span>{a.date}</span>
                      <span className="font-medium">{a.minutes}m</span>
                    </div>
                    {a.note && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{a.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* Assigned plan: read-only here for non-leaders; leaders edit it in the Edit sheet */}
      {!data.can_edit_assigned && <AssignedAllocationCard data={data} />}

      {/* Workflow */}
      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 pb-5 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Workflow</p>
        <Stepper current={data.status_key} />

        {data.status_key === 'cancelled' ? (
          data.can_edit && (
            <button
              onClick={onRestore}
              disabled={restoreTodo.isPending}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-700 py-3 font-semibold text-slate-700 dark:text-slate-200 active:scale-[0.99] disabled:opacity-60"
            >
              {restoreTodo.isPending ? <Spinner className="h-5 w-5" /> : <RotateCcw className="h-4 w-4" />}
              Restore to Planned
            </button>
          )
        ) : (
          <>
            {data.status_key !== 'completed' &&
              (data.can_advance ? (
                <button
                  onClick={onAdvance}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition active:bg-brand-700"
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

            {data.can_reject && (
              <button
                onClick={onReject}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 py-3 font-semibold text-rose-700 dark:text-rose-300 transition active:bg-rose-100 dark:active:bg-rose-500/20"
              >
                <X className="h-4 w-4" />
                Reject
              </button>
            )}

            {data.can_set_auto_approve && !!boot?.settings?.show_auto_approve && (
              <AutoApproveSegment
                mode={data.auto_approve_mode}
                effective={data.auto_approve_effective}
                projectDefault={data.auto_approve_effective && data.auto_approve_mode === 'inherit'}
                disabled={setAutoApprove.isPending}
                onChange={onSetAutoApprove}
              />
            )}

          </>
        )}

      </div>

      {/* Recurrence history */}
      {data.recurring.is_recurring && (
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <Repeat className="h-3.5 w-3.5" /> Recurrence history ({data.occurrences.length})
          </p>
          <p className="mb-3 text-[11px] text-slate-400">
            {data.recurring.state === 'paused' ? 'Paused'
              : data.recurring.state === 'ended' ? 'Ended'
              : data.recurring.next_fire ? `Next: ${data.recurring.next_fire}` : 'Active'}
          </p>
          <ol className="space-y-1.5">
            {data.occurrences.map((o) => {
              const meta = STATUS[o.status_key]
              return (
                <li key={o.name}>
                  <button
                    onClick={() => !o.is_current && navigate(`/project-item/${encodeURIComponent(o.name)}`)}
                    className={clsx(
                      'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition',
                      o.is_current ? 'bg-brand-50 dark:bg-brand-500/15 ring-1 ring-brand-200' : 'bg-slate-50 dark:bg-slate-800/60 ring-2 ring-brand-200 dark:ring-brand-500/30 active:bg-slate-100 dark:active:bg-slate-700',
                    )}
                  >
                    <span>{meta.emoji}</span>
                    <span className="flex-1 text-slate-600 dark:text-slate-300">{o.deadline_human || '—'}</span>
                    {o.is_current ? (
                      <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">This one</span>
                    ) : (
                      <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-medium', meta.pill)}>
                        {meta.label}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {/* Notes */}
      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <FileText className="h-3.5 w-3.5" /> Notes
        </p>
        <Notes todoId={data.name} initial={data.notes} canEdit={data.can_edit_notes} />
      </div>

      {/* Checklist */}
      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <ListChecks className="h-3.5 w-3.5" /> Checklist
        </p>
        <Checklist todoId={data.name} initial={data.checklist} canEdit={data.can_edit_notes} />
      </div>

      {/* Issues — hidden entirely for a viewer with nothing to see and nothing to add. */}
      {(data.issues.length > 0 || data.can_report_issue) && (
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
          <Issues data={data} onReport={() => setIssueOpen(true)} onHelp={setIssueHelpTerm} />
        </div>
      )}

      {/* Files */}
      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <FileText className="h-3.5 w-3.5" /> Files
        </p>
        <Files todoId={data.name} files={data.files ?? []} canEdit={data.can_edit_files ?? false} />
      </div>

      {/* Dependencies */}
      {(data.blocked_by.length > 0 || data.blocking.length > 0) && (
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
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
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
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
                    {e.label} <span className="font-normal text-slate-400 dark:text-slate-500">by {e.by_name}</span>
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{e.at_human}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <CommentThread referenceDoctype="Project Todo" referenceName={id} />

      <FocusNoteSheet open={showFocusNote} onClose={() => setShowFocusNote(false)} todoId={id} title={data.to_do} />

      {showWaiting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Mark as waiting</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">What is this todo waiting on?</p>
            <textarea
              autoFocus
              value={waitingReason}
              onChange={(e) => setWaitingReason(e.target.value)}
              rows={3}
              placeholder="e.g. waiting on client reply"
              className="mt-3 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-800 dark:text-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setShowWaiting(false); setWaitingReason('') }} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
              <button
                onClick={onMarkWaiting}
                disabled={!waitingReason.trim() || setWaiting.isPending}
                className="rounded-full bg-stone-800 dark:bg-slate-200 px-4 py-2 text-sm font-semibold text-white dark:text-slate-900 disabled:opacity-50"
              >
                Mark waiting
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpSheet entries={ISSUE_HELP} term={issueHelpTerm} onClose={() => setIssueHelpTerm(null)} />

      <FollowUpCheckDialog
        open={checkOpen}
        onClose={() => setCheckOpen(false)}
        todo={{ name: data.name, to_do: data.to_do }}
        defaultAssignee={data.creator}
        team={
          data.team.some((m) => m.user === data.assigned_to)
            ? data.team
            : [{ user: data.assigned_to, name: data.assigned_to_name }, ...data.team]
        }
      />
      {(dupOpen || followOpen || issueOpen) && (
        <CreateProjectItemSheet
          open
          onClose={() => {
            setDupOpen(false)
            setFollowOpen(false)
            setIssueOpen(false)
          }}
          projectDetail={data.project_detail}
          team={
            data.team.some((m) => m.user === data.assigned_to)
              ? data.team
              : [{ user: data.assigned_to, name: data.assigned_to_name }, ...data.team]
          }
          siblings={
            followOpen
              ? [{ name: data.name, to_do: data.to_do }, ...data.detail_todos]
              : data.detail_todos
          }
          issueOf={issueOpen ? { name: data.name, title: data.to_do } : undefined}
          initial={
            issueOpen
              ? todoIssueInitial(data, todayISO())
              : followOpen
                ? todoFollowUpInitial(data)
                : todoDuplicateInitial(data)
          }
        />
      )}
    </DetailScreen>
  )
}
