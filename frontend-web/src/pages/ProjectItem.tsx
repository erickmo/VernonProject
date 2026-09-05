import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { safeDecode } from '@web/lib/route'
import { isEditableTarget } from '@web/lib/shortcuts'
import clsx from 'clsx'
import {
  Bot,
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  AlertTriangle,
  Ban,
  CircleCheck,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Check,
  Clock,
  Copy,
  CornerDownRight,
  UserCheck,
  FileText,
  ArrowDown,
  ArrowUp,
  FolderKanban,
  History,
  Layers,
  ListChecks,
  Link2,
  Lock,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Save,
  StickyNote,
  Target,
  Timer,
  Trash2,
  X,
  Zap,
  Eye,
  Sparkles,
  ChevronRight,
} from 'lucide-react'
import {
  useProjectItem,
  useSaveNotes,
  useSaveAiPrompt,
  useSaveChecklist,
  useSetTodoAllocations,
  useSetAssignedAllocation,
  useUpdateTodo,
  useCancelTodo,
  useRestoreTodo,
  useDeleteTodo,
  useUploadTodoFile,
  useDeleteTodoFile,
  useSetAutoApprove,
  useBoot,
  useFocusMode,
  canUseAi,
} from '@/hooks/useData'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { AiPhaseBanner } from '@/components/AiPhaseBanner'
import { AI_PHASES, aiPhaseOf } from '@/lib/filters'
import { STATUS, STATUS_ORDER } from '@/lib/status'
import { formatClock, formatEstimate, formatDate, dateSub, formatNumber, stripHtml, todayISO } from '@/lib/format'
import { GroupLevelPicker } from '@/components/GroupLevelPicker'
import { todoFileHref } from '@/lib/api'
import { Avatar, Spinner } from '@/components/ui'
import { CancelledNote } from '@/components/CancelledNote'
import { Button, OverflowMenu, type MenuItem } from '@web/components/ui'
import CommentThread from '@/components/CommentThread'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { SearchableSelect } from '@/components/SearchableSelect'
import { AssignmentOverloadBanner } from '@/components/AssignmentOverloadBanner'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { openFocusOverlay } from '@/lib/focusUI'
import { BentoTile } from '@web/components/bento'
import { useAdvance } from '@/components/AdvanceProvider'
import { useReject } from '@/components/RejectProvider'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'
import { RecurrenceEditor } from '@web/components/RecurrenceEditor'
import { serializeRecurrence, recurrenceFromDetail, type Recurrence } from '@/lib/recurrence'
import { FocusNoteDialog } from '@web/components/FocusNoteDialog'
import { AutoApproveSegment } from '@web/components/AutoApproveSegment'
import { DatePicker } from '@web/components/DatePicker'
import { todoDuplicateInitial, todoFollowUpInitial } from '@/lib/duplicateTodo'
import { FollowUpCheckDialog } from '@/components/FollowUpCheckDialog'
import { issueCounts, issueHelp, issueLabel, todoIssueInitial } from '@/lib/todoIssues'
import { InfoDot } from '@web/components/InfoDot'
import type { ProjectItemDetail, StatusKey, TodoFile, ChecklistItem, AiPrompt } from '@/lib/types'

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
                  !active && !done && 'border-line dark:border-slate-700 bg-surface text-muted dark:text-slate-600',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : <span>{meta.emoji}</span>}
              </div>
              <span
                className={clsx(
                  'w-16 text-center text-[10px] font-medium leading-tight',
                  active ? 'text-brand-700 dark:text-brand-300' : 'text-muted',
                )}
              >
                {meta.label}
              </span>
            </div>
            {i < STATUS_ORDER.length - 1 && (
              <div className={clsx('-mt-5 h-0.5 flex-1', i < idx ? 'bg-emerald-500' : 'bg-line dark:bg-slate-700')} />
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
        : 'border-line bg-hover/[0.04]'
  const valueColor =
    tone === 'danger'
      ? 'text-rose-700 dark:text-rose-300'
      : tone === 'brand'
        ? 'text-brand-700 dark:text-brand-300'
        : 'text-ink'
  const iconColor =
    tone === 'danger' ? 'text-rose-500' : tone === 'brand' ? 'text-brand-500' : 'text-muted'
  return (
    <div className={clsx('rounded-xl border p-3', accent)}>
      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <Icon className={clsx('h-3 w-3', iconColor)} /> {label}
      </p>
      <div className={clsx('truncate text-sm font-bold leading-tight', valueColor)}>{value}</div>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>}
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
            className="inline-flex max-w-full items-center rounded-xl bg-canvas px-2.5 py-1 text-xs font-medium text-ink dark:text-slate-200 transition active:scale-[0.99] hover:bg-hover/[0.04]"
          >
            <span className="truncate">{resolve(id)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────── Issues ───────────────────────────

/** Issues raised on this todo. Each one IS a todo (own assignee, deadline and points)
 *  pointing back here, so a row links out. Resolved = the issue's todo reached
 *  Completed — done AND approved. Mirrors the /m Issues card. */
function Issues({ data, onReport }: { data: ProjectItemDetail; onReport: () => void }) {
  const counts = issueCounts(data.issues)
  const open = data.issues.filter((i) => !i.resolved && i.status_key !== 'cancelled')
  const rest = data.issues.filter((i) => i.resolved || i.status_key === 'cancelled')
  const rows = [...open, ...rest] // unresolved first — that is the part that needs work

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <AlertTriangle className={clsx('h-3.5 w-3.5', counts.open > 0 && 'text-amber-500')} /> Issues
          <InfoDot term="apa-itu" lookup={issueHelp} />
        </p>
        {data.can_report_issue && (
          <Button variant="ghost" onClick={onReport} className="!px-2.5 !py-1 !text-xs">
            <Plus className="h-3.5 w-3.5" /> Report issue
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          No issues on this todo.
          {data.can_report_issue ? ' Found something that needs fixing? Report it as its own task.' : ''}
        </p>
      ) : (
        <>
          <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-muted">
            {issueLabel(counts)}
            <InfoDot term="kapan-selesai" lookup={issueHelp} />
          </p>
          <ul className="space-y-1.5">
            {rows.map((i) => {
              const meta = STATUS[i.status_key]
              return (
                <li key={i.name}>
                  <Link
                    to={`/project-item/${encodeURIComponent(i.name)}`}
                    className={clsx(
                      'flex items-start gap-2 rounded-xl px-3 py-2 transition hover:brightness-[0.98]',
                      i.resolved
                        ? 'bg-emerald-50 dark:bg-emerald-500/10'
                        : i.status_key === 'cancelled'
                          ? 'bg-canvas opacity-70'
                          : 'bg-amber-50 dark:bg-amber-500/10',
                    )}
                  >
                    {i.resolved ? (
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : i.status_key === 'cancelled' ? (
                      <Ban className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={clsx(
                          'block text-sm font-medium text-ink',
                          i.status_key === 'cancelled' && 'line-through',
                        )}
                      >
                        {i.to_do}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted">
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

// ─────────────────────────── Notes ───────────────────────────

function AiPromptList({ todoId, initial, canEdit }: { todoId: string; initial: AiPrompt[]; canEdit: boolean }) {
  const save = useSaveAiPrompt(todoId)
  const toast = useToast()
  const [items, setItems] = useState<AiPrompt[]>(initial)
  const [saved, setSaved] = useState(false)
  const baseline = useRef(JSON.stringify(initial))

  useEffect(() => {
    if (baseline.current === JSON.stringify(items)) {
      baseline.current = JSON.stringify(initial)
      setItems(initial)
    }
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next?: AiPrompt[]) => {
    const payload = (next ?? items).filter((p) => p.prompt.trim())
    const key = JSON.stringify(payload)
    if (key === baseline.current) return
    save.mutate(payload, {
      onSuccess: (res) => {
        baseline.current = key
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        toast('success', res.message)
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  const [openIdx, setOpenIdx] = useState<number[]>([])
  const toggleOpen = (i: number) => setOpenIdx((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]))
  const patch = (i: number, p: Partial<AiPrompt>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const add = () => setItems((xs) => { setOpenIdx((o) => [...o, xs.length]); return [...xs, { name: '', prompt: '' }] })
  const remove = (i: number) => {
    const next = items.filter((_, j) => j !== i)
    setItems(next)
    setOpenIdx((o) => o.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)))
    commit(next)
  }

  if (!canEdit) {
    return initial.length ? (
      <ol className="space-y-2">
        {initial.map((p, i) => (
          <li key={i}>
            <details className="rounded-xl border border-violet-200 dark:border-violet-500/30 bg-surface p-2.5">
              <summary className="cursor-pointer select-none truncate text-sm font-semibold text-violet-700 dark:text-violet-300">{p.name || `Prompt ${i + 1}`}</summary>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{p.prompt}</p>
            </details>
          </li>
        ))}
      </ol>
    ) : (
      <p className="text-sm italic text-muted">Belum ada prompt.</p>
    )
  }

  const inputCls = 'w-full rounded-lg border border-violet-200 dark:border-violet-500/40 bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

  return (
    <div className="space-y-3">
      {items.map((p, i) => (
        <div key={i} className="rounded-xl border border-violet-200 dark:border-violet-500/30 bg-surface p-2.5">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => toggleOpen(i)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
              <ChevronRight className={clsx('h-4 w-4 shrink-0 text-violet-400 transition-transform', openIdx.includes(i) && 'rotate-90')} />
              <span className="truncate text-sm font-semibold text-violet-700 dark:text-violet-300">{p.name || `Prompt ${i + 1}`}</span>
            </button>
            <button type="button" onClick={() => remove(i)} title="Hapus prompt" className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {openIdx.includes(i) && (
            <div className="mt-2 space-y-2">
              <input
                value={p.name}
                onChange={(e) => patch(i, { name: e.target.value })}
                onBlur={() => commit()}
                placeholder={`Nama / untuk apa (Prompt ${i + 1})`}
                className={clsx(inputCls, 'font-semibold')}
              />
              <textarea
                value={p.prompt}
                onChange={(e) => patch(i, { prompt: e.target.value })}
                onBlur={() => commit()}
                rows={3}
                placeholder="Tulis prompt / instruksi untuk AI…"
                className={clsx(inputCls, 'resize-none [field-sizing:content] leading-relaxed')}
              />
            </div>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-lg bg-violet-100 dark:bg-violet-500/20 px-2.5 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
          <Plus className="h-3.5 w-3.5" /> Tambah prompt
        </button>
        <span className="flex h-5 items-center text-xs text-muted">
          {save.isPending ? (
            <span className="inline-flex items-center gap-1"><Spinner className="h-3 w-3" /> Menyimpan…</span>
          ) : saved ? (
            <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="h-3.5 w-3.5" /> Tersimpan</span>
          ) : null}
        </span>
      </div>
    </div>
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
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{clean}</p>
    ) : (
      <p className="text-sm italic text-muted">No notes yet.</p>
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
        className="w-full resize-none [field-sizing:content] rounded-xl border border-line bg-hover/[0.04] p-3 text-sm leading-relaxed text-ink placeholder:text-muted outline-none transition focus:border-brand-400 focus:bg-surface focus:ring-2 focus:ring-brand-100"
      />
      <div className="mt-1.5 flex h-5 items-center justify-end text-xs text-muted">
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

// ─────────────────────────── Checklist ───────────────────────────

function Checklist({ todoId, initial, canEdit }: { todoId: string; initial: ChecklistItem[]; canEdit: boolean }) {
  const save = useSaveChecklist(todoId)
  const toast = useToast()
  const [items, setItems] = useState<ChecklistItem[]>(initial ?? [])
  const [newItem, setNewItem] = useState('')
  const baseline = useRef(JSON.stringify(initial ?? []))

  useEffect(() => {
    if (baseline.current === JSON.stringify(items)) {
      setItems(initial ?? [])
      baseline.current = JSON.stringify(initial ?? [])
    }
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: ChecklistItem[]) => {
    setItems(next)
    baseline.current = JSON.stringify(next)
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

  if (!canEdit) {
    if (!items.length) return <p className="text-sm italic text-muted">No checklist.</p>
    return (
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            {it.d ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="inline-block h-4 w-4 rounded border border-line" />}
            <span className={it.d ? 'text-muted line-through' : 'text-ink'}>{it.t}</span>
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
            <li key={i} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
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
                className={'flex-1 bg-transparent text-sm outline-none ' + (it.d ? 'text-muted line-through' : 'text-ink')}
              />
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="text-muted disabled:opacity-30 hover:text-ink">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="text-muted disabled:opacity-30 hover:text-ink">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button onClick={() => commit(items.filter((_, j) => j !== i))} aria-label="Remove item" className="text-rose-500 hover:text-rose-600">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className="w-full rounded-xl border border-line bg-hover/[0.04] px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-brand-400 focus:bg-surface focus:ring-2 focus:ring-brand-100"
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
          className="flex shrink-0 items-center justify-center rounded-xl bg-brand-600 px-3 text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {items.length > 0 && <p className="mt-1.5 text-xs text-muted">{done}/{items.length} selesai</p>}
    </div>
  )
}

// ─────────────────────────── Files ───────────────────────────

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
      {files.length === 0 && <p className="text-sm italic text-muted">No files yet.</p>}
      {files.map((f) => (
        <div
          key={f.name}
          className="flex items-center gap-2 rounded-xl border border-line bg-hover/[0.04] px-3 py-2"
        >
          <FileText className="h-4 w-4 shrink-0 text-muted" />
          <a
            href={todoFileHref(todoId, f)}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate text-sm text-brand-600 hover:underline dark:text-brand-400"
          >
            {f.file_name}
          </a>
          {f.file_size ? (
            <span className="shrink-0 text-xs text-muted">{fmtFileSize(f.file_size)}</span>
          ) : null}
          {canEdit && (
            <button
              onClick={() => onDelete(f)}
              className="shrink-0 rounded-md p-1 text-muted transition hover:bg-hover hover:text-red-500"
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
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-sm font-medium text-muted transition active:scale-[0.99] hover:border-brand-400 hover:text-brand-600 disabled:opacity-60"
          >
            {up.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {up.isPending ? 'Uploading…' : 'Add files'}
          </button>
        </div>
      )}
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
    'rounded-xl border border-line bg-hover/[0.04] text-ink px-2.5 py-2 text-sm focus:border-brand-600 focus:outline-none placeholder:text-muted'

  const addRow = () => setRows((r) => [...r, { date: '', minutes: 0, note: '' }])
  const removeRow = (i: number) => setRows((r) => r.filter((_, j) => j !== i))
  const setRow = (i: number, patch: Partial<AllocRow>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  // A plan is savable only when every row with minutes has a date and (if the
  // task is estimated) the daily split adds up to the estimate. Autosave stays
  // silent while invalid — the total/estimate chip already flags the mismatch.
  const valid =
    !rows.some((r) => !r.date && Number(r.minutes) > 0) &&
    (data.estimated <= 0 || total === data.estimated)

  // Autosave: debounce edits, then persist a valid, changed plan. No success
  // toast — saving is ambient, not an explicit action.
  const lastSaved = useRef(JSON.stringify(rows.filter((r) => r.date)))
  useEffect(() => {
    if (!valid) return
    const clean = rows.filter((r) => r.date)
    const snap = JSON.stringify(clean)
    if (snap === lastSaved.current) return
    const t = setTimeout(() => {
      lastSaved.current = snap
      save.mutate(clean, { onError: (e) => toast('error', (e as Error).message) })
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, valid])

  return (
    <div className="mt-4 rounded-xl bg-surface p-4 border border-line">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <CalendarRange className="h-4 w-4" /> My plan
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
            className="flex flex-col gap-2 rounded-xl border border-line bg-hover/[0.04] p-2"
          >
            <div className="flex items-center gap-2">
              <DatePicker
                value={r.date}
                onChange={(v) => setRow(i, { date: v })}
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
                className="shrink-0 rounded-xl p-1.5 text-rose-600 transition active:scale-[0.97] hover:bg-rose-50 dark:hover:bg-rose-500/15"
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
          <p className="py-1 text-center text-xs text-muted">
            No day split yet — add a day to plan your time.
          </p>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="secondary" onClick={addRow}>
          <Plus className="h-4 w-4" /> Add day
        </Button>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted">
          {save.isPending ? (
            <><Spinner className="h-3.5 w-3.5" /> Saving…</>
          ) : !valid && rows.length > 0 ? (
            <span className="text-rose-600 dark:text-rose-400">Won't autosave until the split matches the estimate</span>
          ) : (
            <><Check className="h-3.5 w-3.5 text-emerald-500" /> Autosaves</>
          )}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────── AssignedAllocationCard ───────────────────────────

// Leader/SM-set day plan. Editable when can_edit_assigned (shown inside the edit
// form); read-only everywhere else. Saved via its own endpoint — never scores.
function AssignedAllocationCard({ data }: { data: ProjectItemDetail }) {
  const save = useSetAssignedAllocation(data.name)
  const toast = useToast()
  const [rows, setRows] = useState<AllocRow[]>(
    (data.assigned_allocation ?? []).map((a) => ({ date: a.date, minutes: a.minutes, note: a.note ?? '' })),
  )

  const total = rows.reduce((s, r) => s + (Number(r.minutes) || 0), 0)
  const field =
    'rounded-xl border border-line bg-hover/[0.04] text-ink px-2.5 py-2 text-sm focus:border-brand-600 focus:outline-none placeholder:text-muted'

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
    <div className="mt-4 rounded-xl bg-surface p-4 border border-line">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
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
              <div
                key={i}
                className="flex flex-col gap-2 rounded-xl border border-line bg-hover/[0.04] p-2"
              >
                <div className="flex items-center gap-2">
                  <DatePicker
                    value={r.date}
                    onChange={(v) => setRow(i, { date: v })}
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
                    className="shrink-0 rounded-xl p-1.5 text-rose-600 transition active:scale-[0.97] hover:bg-rose-50 dark:hover:bg-rose-500/15"
                  >
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
              <p className="py-1 text-center text-xs text-muted">No assigned plan yet — add a day.</p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="secondary" onClick={addRow}>
              <Plus className="h-4 w-4" /> Add day
            </Button>
            <Button variant="primary" onClick={onSave} disabled={save.isPending}>
              {save.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save plan
            </Button>
          </div>
        </>
      ) : alloc.length > 0 ? (
        <div className="flex flex-col gap-2 text-sm text-muted">
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
                {a.note && <p className="mt-0.5 text-xs text-muted">{a.note}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-1 text-center text-xs text-muted">No assigned plan yet.</p>
      )}
    </div>
  )
}

// Only the top-most open todo responds to e/f/t: a workspace-inline ProjectItem
// can stay mounted behind a TodoDrawer, and a raw document listener would else
// fire on the off-screen instance too (silently mutating the hidden todo).
const todoKeyStack: symbol[] = []

// Keyboard shortcuts for an open todo. A child component so its effect obeys the
// rules of hooks (ProjectItem early-returns before data loads); it mounts only
// when a todo is on screen, so `e`/`f`/`t` auto-scope to "a task is open".
function TodoShortcuts(props: {
  canEdit: boolean
  editing: boolean
  focusActive: boolean
  canDeadlineToday: boolean
  canCheck: boolean
  canAi: boolean
  canRequestCheck: boolean
  onEdit: () => void
  onFocusToggle: () => void
  onDeadlineToday: () => void
  onToggleCheck: () => void
  onToggleAi: () => void
  onRequestCheck: () => void
}) {
  const ref = useRef(props)
  ref.current = props
  useEffect(() => {
    const token = Symbol()
    todoKeyStack.push(token)
    const onKey = (e: KeyboardEvent) => {
      if (todoKeyStack[todoKeyStack.length - 1] !== token) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditableTarget(e.target)) return
      const s = ref.current
      if (s.editing) return
      if (e.key === 'e' && s.canEdit) { e.preventDefault(); s.onEdit() }
      else if (e.key === 'f') { e.preventDefault(); s.onFocusToggle() }
      else if (e.key === 't' && s.canDeadlineToday) { e.preventDefault(); s.onDeadlineToday() }
      else if (e.key === 'c' && s.canCheck) { e.preventDefault(); s.onToggleCheck() }
      else if (e.key === 'a' && s.canAi) { e.preventDefault(); s.onToggleAi() }
      else if (e.key === 'r' && s.canRequestCheck) { e.preventDefault(); s.onRequestCheck() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = todoKeyStack.indexOf(token)
      if (i !== -1) todoKeyStack.splice(i, 1)
    }
  }, [])
  return null
}

// ─────────────────────────── EditForm ───────────────────────────

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
  // Exception fields aren't in the shared `recurring` type yet (added on the API
  // side by a sibling change); read them through a local view.
  const recDetail = data.recurring as typeof data.recurring & {
    exception_weekdays?: string; exception_monthdays?: string
    exception_dates?: { from: string; to: string }[]; exception_behavior?: string
  }
  const [rec, setRec] = useState<Recurrence>(() => recurrenceFromDetail(recDetail))
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
      fields.estimated = estimated === '' ? 0 : Number(estimated)
    }
    // Mentor credit is leader/owner-set (backend re-checks). Empty clears it.
    if (data.can_edit_estimate) {
      fields.mentor = mentor
    }
    fields.estimated_done_to_checked = Number(pDC) || 0
    fields.estimated_checked_to_completed = Number(pCC) || 0
    Object.assign(fields, serializeRecurrence(rec))
    fields.leader_deadline = leaderDeadline || ''
    fields.owner_deadline = ownerDeadline || ''
    fields.group = group
    fields.level_id = level
    fields.work_mode = workMode
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

  // ⌘S / Ctrl+S saves the open edit form (fires even while typing in a field).
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const fieldCls =
    'w-full rounded-xl border border-line bg-hover/[0.04] px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-brand-400 focus:bg-surface focus:ring-2 focus:ring-brand-100 disabled:opacity-60'

  return (
    <div className="rounded-2xl bg-surface p-4 border border-line">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Edit todo</p>

      <label className="mb-1 block text-xs font-medium text-muted">Title</label>
      <textarea
        value={toDo}
        onChange={(e) => setToDo(e.target.value)}
        rows={2}
        className={clsx(fieldCls, 'mb-3 resize-none')}
      />

      <label className="mb-1 block text-xs font-medium text-muted">Assigned to</label>
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
          <label className="mb-1 block text-xs font-medium text-muted">
            Mentor <span className="font-normal text-muted">· optional, earns a share for coaching</span>
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
        <label className="mb-1 block text-xs font-medium text-muted">Start date</label>
        <DatePicker
          value={startDate}
          disabled={locked}
          onChange={(v) => setStartDate(v)}
          className={fieldCls}
        />
      </div>

      <div className="mb-3 flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted">Deadline</label>
          <DatePicker
            value={deadline}
            disabled={locked}
            onChange={(v) => setDeadline(v)}
            className={fieldCls}
          />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs font-medium text-muted">Est. (min)</label>
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
      <div className="mb-3 rounded-xl border border-line bg-hover/[0.04] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted">Approval phases (optional)</span>
          <span className="rounded-full bg-brand-100 dark:bg-brand-500/20 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:text-brand-300">
            Est total {phaseTotal || 0}m
          </span>
        </div>
        {[
          { label: 'Leader approval', date: leaderDeadline, setDate: setLeaderDeadline, est: pDC, setEst: setPDC },
          { label: 'Owner approval', date: ownerDeadline, setDate: setOwnerDeadline, est: pCC, setEst: setPCC },
        ].map((p) => (
          <div key={p.label} className="mb-3 last:mb-0">
            <label className="mb-1.5 block text-xs font-semibold text-muted">{p.label}</label>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted">
                  Deadline
                </span>
                <DatePicker
                  value={p.date}
                  onChange={(v) => p.setDate(v)}
                  className={clsx(fieldCls, 'min-w-0')}
                />
              </div>
              <div className="w-24 shrink-0">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted">
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
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
                    m
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recurring */}
      <div className="mb-3 rounded-xl border border-line bg-hover/[0.04] p-3">
        <label className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium text-muted">
            <Repeat className="h-4 w-4 text-muted" /> Repeat this todo
          </span>
          <input
            type="checkbox"
            checked={rec.isRecurring}
            onChange={(e) => setRec({ ...rec, isRecurring: e.target.checked })}
            className="h-5 w-5 accent-brand-600"
          />
        </label>
        {rec.isRecurring && (
          <div className="mt-3">
            <RecurrenceEditor value={rec} onChange={setRec} />
          </div>
        )}
      </div>

      <div className="mb-3">
        <GroupLevelPicker
          value={{ group, typeName: '', levelId: level }}
          onChange={(v) => { setGroup(v.group); setLevel(v.levelId) }}
          estimated={estimated}
        />
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-muted">Work mode <span className="font-normal opacity-70">· siapa yang kerjakan</span></label>
        <div className="flex gap-2">
          {(['Human', 'AI', 'Both'] as const).map((m) => {
            // Tagging AI needs AI access; already-tagged todos stay switchable so a
            // revoked user can still move one back to Human. Backend re-checks.
            const locked = (m === 'AI' || m === 'Both') && !data.can_use_ai && workMode !== m
            return (
            <button
              key={m}
              type="button"
              disabled={locked}
              title={locked ? 'Minta Administrator mengaktifkan akses AI untuk akun Anda.' : undefined}
              onClick={() => setWorkMode(workMode === m ? '' : m)}
              className={clsx(
                'flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                locked && 'cursor-not-allowed opacity-40',
                workMode === m
                  ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/60 dark:bg-brand-500/20 dark:text-brand-300'
                  : 'border-line bg-surface-2 text-muted hover:border-brand-300',
              )}
            >
              {m}
            </button>
          )})}
        </div>
      </div>

      {data.detail_todos.length > 0 && (
        <div className="mb-3">
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted">
            <ArrowDownLeft className="h-3.5 w-3.5 text-rose-500" /> Blocked by
          </label>
          <MultiSelectSearch
            value={blockedBy}
            onChange={setBlockedBy}
            options={data.detail_todos.map((t) => ({ value: t.name, label: t.to_do }))}
          />
          <label className="mb-1 mt-3 flex items-center gap-1 text-xs font-medium text-muted">
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
        <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <Lock className="h-3.5 w-3.5" />
          Assignee, start date, deadline &amp; estimate are locked once a todo is Done.
        </p>
      )}

      {/* My plan — assignee-editable day split (moved here from the detail view) */}
      {data.is_mine && <AllocationCard data={data} />}

      {/* Assigned plan (leader/SM-editable) */}
      {data.can_edit_assigned && <AssignedAllocationCard data={data} />}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" /> Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={update.isPending || !toDo.trim()}>
          {update.isPending ? <Spinner className="h-4 w-4" /> : <><Save className="h-4 w-4" /> Save changes</>}
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────── Main page ───────────────────────────

export default function ProjectItem() {
  const params = useParams()
  const todoName = safeDecode(params.itemName ?? params.name ?? '')
  // Rendered inside the projects workspace slide-over when both params exist;
  // build same-detail links workspace-relative so they don't drop the rail.
  const inWs = !!(params.name && params.detailName)
  const wsProject = params.name ?? ''

  const { data, isLoading } = useProjectItem(todoName)
  const { data: boot } = useBoot()
  const canAutoApprove = !!boot?.settings?.show_auto_approve
  const aiAllowed = canUseAi(boot)
  const advanceConfirm = useAdvance()
  const rejectConfirm = useReject()
  const cancelTodo = useCancelTodo()
  const restoreTodo = useRestoreTodo()
  const deleteTodo = useDeleteTodo()
  const setAutoApprove = useSetAutoApprove()
  const setDeadlineToday = useUpdateTodo(todoName)
  const setWaiting = useUpdateTodo(todoName)
  const setPriority = useUpdateTodo(todoName)
  const setCheck = useUpdateTodo(todoName)
  const setAi = useUpdateTodo(todoName)
  const confirm = useConfirm()
  const navigate = useNavigate()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [showWaiting, setShowWaiting] = useState(false)
  const [showFocusNote, setShowFocusNote] = useState(false)
  const [waitingReason, setWaitingReason] = useState('')
  const focus = useFocusTimer(todoName)
  const focusMode = useFocusMode()
  const [dupOpen, setDupOpen] = useState(false)
const [followOpen, setFollowOpen] = useState(false)
  const [checkOpen, setCheckOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

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
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">Could not load todo</p>
      </div>
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
      const res = await cancelTodo.mutateAsync({
        projectItem: data.name,
        reason: reason.trim() || undefined,
      })
      toast(res.status === 'ok' ? 'success' : 'info', res.message)
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
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Delete failed')
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

  // Toggle the AI work-mode flag in place (same as the card menu). Full Human/AI/Both
  // picker still lives in the edit form; this just flips 'AI' ⇄ '' for the shortcut/menu.
  const onToggleAi = () => {
    if (setAi.isPending) return
    const next = data.work_mode === 'AI' ? '' : 'AI'
    setAi.mutate(
      { work_mode: next },
      {
        onSuccess: () => toast('success', next ? 'Ditandai kerja AI' : 'Tanda AI dilepas'),
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
              data.level_type && data.level ? `${data.level_type} · ${data.level}` : data.level_type || data.level,
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined,
      })
    // inline mode: the timer shows inline on this screen; the dock opens the overlay.
    if (focusMode === 'fullscreen') openFocusOverlay(data.name)
  }
  const focusOver = focusActive && focus.hasEstimate && focus.remainingMs < 0
  const focusValueMs = focusActive ? (focus.hasEstimate ? focus.remainingMs : focus.elapsedMs) : 0

  return (
    <div className="space-y-6">
      <TodoShortcuts
        canEdit={data.can_edit}
        editing={editing}
        focusActive={focusActive}
        canDeadlineToday={canSetDeadlineToday}
        canCheck={!!data.is_mine && data.status_key !== 'cancelled'}
        canAi={(!!data.is_mine || !!data.can_prioritize) && data.status_key !== 'cancelled' && (aiAllowed || data.work_mode === 'AI')}
        canRequestCheck={!!data.can_create}
        onEdit={() => setEditing(true)}
        onFocusToggle={() => (focusActive ? focus.stop() : openFocus())}
        onDeadlineToday={onDeadlineToday}
        onToggleCheck={onToggleCheck}
        onToggleAi={onToggleAi}
        onRequestCheck={() => setCheckOpen(true)}
      />
      {data.status_key === 'cancelled' && <CancelledNote item={data} />}
      {data.issue_of && (
        <Link
          to={`/project-item/${encodeURIComponent(data.issue_of)}`}
          className="flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 transition hover:brightness-[0.98]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="min-w-0 flex-1 truncate text-sm text-ink">
            <span className="font-semibold text-amber-700 dark:text-amber-300">Issue on</span>{' '}
            {data.issue_of_title ?? data.issue_of}
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            {data.status_key === 'completed' ? 'Resolved' : 'Open'}
          </span>
          <InfoDot term="apa-itu" lookup={issueHelp} />
        </Link>
      )}
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            {data.project_name}
          </p>
          <Link
            to={inWs
              ? `/project/${encodeURIComponent(wsProject)}/detail/${encodeURIComponent(data.project_detail)}`
              : `/project-detail/${encodeURIComponent(data.project_detail)}`}
            className="text-sm text-brand-600 hover:underline dark:text-brand-400"
          >
            in {data.project_detail_title}
          </Link>
          <h2 className="mt-1 text-xl font-bold leading-snug text-ink">{data.to_do}</h2>
          {(aiPhaseOf(data) > 0 || data.to_check) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {aiPhaseOf(data) > 0 && (
                <span title={`Fase ${aiPhaseOf(data)} · ${AI_PHASES[aiPhaseOf(data)].label}`} className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-cyan-500 to-violet-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                  <Bot className="h-3.5 w-3.5" /> AI {aiPhaseOf(data)} · {AI_PHASES[aiPhaseOf(data)].label}
                </span>
              )}
              {data.to_check && (
                <span title="Perlu dicek" className="inline-flex items-center gap-1 rounded-md bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                  <Eye className="h-3.5 w-3.5" /> Perlu dicek
                </span>
              )}
            </div>
          )}
        </div>

        {!editing && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Focus — the primary "start working" action */}
            <Button
              variant={focusActive ? 'secondary' : 'primary'}
              size="sm"
              onClick={openFocus}
              className={clsx(focusActive && focusOver && 'text-rose-600 dark:text-rose-400')}
            >
              <Timer className="h-4 w-4" />
              {focusActive ? (
                <>
                  {focusMode === 'inline'
                    ? focus.timer?.status === 'paused' ? 'Paused' : 'Focusing'
                    : focus.timer?.status === 'paused' ? 'Resume' : 'Focus'}
                  <span className="font-mono tabular-nums">{focusOver ? '+' : ''}{formatClock(focusValueMs)}</span>
                </>
              ) : (
                'Focus'
              )}
            </Button>

            {/* Waiting toggle — park a planned todo or resume it (beside Focus) */}
            {canWait &&
              (data.is_waiting ? (
                <Button variant="secondary" size="sm" onClick={onResume} disabled={setWaiting.isPending}>
                  <Play className="h-4 w-4" /> Resume
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setShowWaiting(true)}>
                  <Pause className="h-4 w-4" /> Mark waiting
                </Button>
              ))}

            {data.can_edit && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}

            <OverflowMenu
              size="sm"
              items={[
                { label: focus.note ? 'Edit focus note' : 'Add focus note', icon: StickyNote, onClick: () => setShowFocusNote(true) },
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
                ...(data.status_key === 'cancelled' && data.can_edit
                  ? [{ label: 'Restore to Planned', icon: RotateCcw, onClick: onRestore, disabled: restoreTodo.isPending }]
                  : []),
                ...(data.can_edit && data.status_key !== 'completed' && data.status_key !== 'cancelled'
                  ? [{ label: 'Cancel task', icon: Ban, danger: true, onClick: onCancel }]
                  : []),
                ...(data.can_delete
                  ? [{ label: 'Delete task', icon: Trash2, danger: true, onClick: onDelete, disabled: deleteTodo.isPending }]
                  : []),
              ] as MenuItem[]}
            />
          </div>
        )}
      </div>

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
        renderDateField={(p) => (
          <DatePicker
            value={p.value}
            onChange={p.onChange}
            placeholder="Pilih tanggal…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        )}
      />
      {(dupOpen || followOpen || issueOpen) && (
        <CreateProjectItemDialog
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

      {editing ? (
        <div className="max-w-3xl">
          <EditForm data={data} onClose={() => setEditing(false)} />
        </div>
      ) : (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          {/* Todo-detail two-column: right panel (notes/checklist/files) is the wider 60%.
              flex parent → BentoTile's grid col-span classes go inert; lg:w-* drives the split. */}
          {/* ── LEFT COLUMN (40%) ── */}
          <BentoTile span="wide" tone="plain" className="space-y-5 lg:w-2/5">
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

            {/* Waiting / parked */}
            {data.is_waiting && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 dark:bg-yellow-500/15 px-2.5 py-1 text-xs font-semibold text-yellow-800 dark:text-yellow-300">
                  <Pause className="h-3.5 w-3.5" /> Waiting{data.waiting_reason ? ` · ${data.waiting_reason}` : ''}
                </span>
                {data.waiting_since && (
                  <span className="text-xs text-muted">
                    Waiting since {data.waiting_since.slice(0, 10)}
                    {data.waiting_by_name ? ` · set by ${data.waiting_by_name}` : ''}
                  </span>
                )}
              </div>
            )}

            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-line bg-hover/[0.04] p-3">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  <Target className="h-3 w-3 text-muted" /> Assignee
                </p>
                <div className="flex items-center gap-1.5">
                  <Avatar name={data.assigned_to_name} image={data.assigned_to_image} config={data.assigned_to_avatar_config} size={20} />
                  <span className="truncate text-sm font-bold text-ink">
                    {data.assigned_to_name}
                  </span>
                </div>
              </div>

              <StatTile
                icon={CalendarDays}
                label="Start date"
                value={data.start_date_human || formatDate(data.start_date) || '—'}
                sub={dateSub(data.start_date)}
              />

              <StatTile
                icon={CalendarDays}
                label="Deadline"
                tone={data.is_overdue ? 'danger' : 'default'}
                value={data.deadline_human || formatDate(data.deadline) || '—'}
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
                      data.point != null ? `${formatNumber(data.point)} pts` : '',
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
                <StatTile icon={Clock} label="Today" tone="brand" value={formatEstimate(data.today_allocation)} sub="allocated" />
              )}
            </div>

            {/* My plan — editable day split for the assignee, read-only for others */}
            {data.is_mine ? (
              <AllocationCard data={data} />
            ) : (
              (data.allocations ?? []).length > 0 && (
                <div className="rounded-xl bg-surface p-4 border border-line">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    <CalendarRange className="h-4 w-4" /> Day split
                  </p>
                  <div className="flex flex-col gap-2 text-sm text-muted">
                    {(data.allocations ?? []).map((a, i) => (
                      <div key={i}>
                        <div className="flex justify-between">
                          <span>{a.date}</span>
                          <span className="font-medium">{a.minutes}m</span>
                        </div>
                        {a.note && <p className="mt-0.5 text-xs text-muted">{a.note}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Assigned plan: read-only here; leaders edit it in the Edit form */}
            {!data.can_edit_assigned && <AssignedAllocationCard data={data} />}

            {/* Workflow */}
            <div className="rounded-xl bg-surface p-4 border border-line">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">
                Workflow
              </p>
              <Stepper current={data.status_key} />

              {data.status_key === 'cancelled' ? null : (
                <>
                  {data.status_key !== 'completed' &&
                    (data.can_advance ? (
                      <Button variant="primary" onClick={onAdvance} className="mt-5">
                        {data.next_status_label}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    ) : (
                      <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-hover/[0.04] py-3 text-sm text-muted">
                        <Lock className="h-4 w-4" />
                        Waiting on someone else to advance this
                      </div>
                    ))}

                  {data.can_reject && (
                    <button
                      onClick={onReject}
                      className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 dark:border-rose-500/40 text-sm font-semibold text-rose-600 dark:text-rose-400 transition active:scale-[0.97] hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    >
                      <X className="h-4 w-4" />
                      Reject
                    </button>
                  )}

                  {data.can_set_auto_approve && canAutoApprove && (
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
            {data.occurrences.length > 1 && (
              <div className="rounded-xl bg-surface p-4 border border-line">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <Repeat className="h-3.5 w-3.5" /> Recurrence history ({data.occurrences.length})
                </p>
                <ol className="space-y-1.5">
                  {data.occurrences.map((o) => {
                    const meta = STATUS[o.status_key]
                    return (
                      <li key={o.name}>
                        <Link
                          to={o.is_current
                            ? '#'
                            : inWs
                            ? `/project/${encodeURIComponent(wsProject)}/detail/${encodeURIComponent(data.project_detail)}/item/${encodeURIComponent(o.name)}`
                            : `/project-item/${encodeURIComponent(o.name)}`}
                          onClick={(e) => o.is_current && e.preventDefault()}
                          className={clsx(
                            'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition',
                            o.is_current
                              ? 'bg-brand-50 dark:bg-brand-500/15 ring-1 ring-brand-200'
                              : 'bg-hover/[0.04] hover:bg-hover/[0.04]',
                          )}
                        >
                          <span>{meta.emoji}</span>
                          <span className="flex-1 text-muted">
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
          </BentoTile>

          {/* ── RIGHT COLUMN (60%) ── */}
          <BentoTile span="md" tone="plain" className="space-y-5 lg:w-3/5">
            {/* AI — the 3-phase banner then the prompts (editable by leader/owner/assignee). */}
            {(data.work_mode === 'AI' || data.work_mode === 'Both') && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-500/30 dark:bg-violet-500/10">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400">
                  <Sparkles className="h-3.5 w-3.5" /> Prompt
                </p>
                <AiPhaseBanner todo={data} />
                <AiPromptList todoId={data.name} initial={data.ai_prompts ?? []} canEdit={!!data.can_edit_prompt} />
              </div>
            )}

            {/* Notes */}
            <div className="rounded-xl bg-surface p-4 border border-line">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <FileText className="h-3.5 w-3.5" /> Notes
              </p>
              <Notes todoId={data.name} initial={data.notes} canEdit={data.can_edit_notes} />
            </div>

            {/* Checklist */}
            <div className="rounded-xl bg-surface p-4 border border-line">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <ListChecks className="h-3.5 w-3.5" /> Checklist
              </p>
              <Checklist todoId={data.name} initial={data.checklist} canEdit={data.can_edit_notes} />
            </div>

            {/* Issues — hidden entirely for a viewer with nothing to see and nothing to add. */}
            {(data.issues.length > 0 || data.can_report_issue) && (
              <div className="rounded-xl bg-surface p-4 border border-line">
                <Issues data={data} onReport={() => setIssueOpen(true)} />
              </div>
            )}

            {/* Files */}
            <div className="rounded-xl bg-surface p-4 border border-line">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <FileText className="h-3.5 w-3.5" /> Files
              </p>
              <Files todoId={data.name} files={data.files ?? []} canEdit={data.can_edit_files ?? false} />
            </div>

            {/* Dependencies */}
            {(data.blocked_by.length > 0 || data.blocking.length > 0) && (
              <div className="rounded-xl bg-surface p-4 border border-line">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
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
              <div className="rounded-xl bg-surface p-4 border border-line">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <History className="h-3.5 w-3.5" /> Activity
                </p>
                <ol className="space-y-3">
                  {data.timeline.map((e, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="text-sm">
                        <p className="font-medium text-ink dark:text-slate-200">
                          {e.label}{' '}
                          <span className="font-normal text-muted">by {e.by_name}</span>
                        </p>
                        <p className="text-xs text-muted">{e.at_human}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Comments */}
            <CommentThread referenceDoctype="Project Todo" referenceName={todoName} />

      <FocusNoteDialog open={showFocusNote} onClose={() => setShowFocusNote(false)} todoId={todoName} title={data.to_do} />
          </BentoTile>
        </div>
      )}

      {showWaiting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-4 shadow-xl border border-line">
            <h3 className="text-base font-bold text-ink">Mark as waiting</h3>
            <p className="mt-1 text-sm text-muted">What is this todo waiting on?</p>
            <textarea
              autoFocus
              value={waitingReason}
              onChange={(e) => setWaitingReason(e.target.value)}
              rows={3}
              placeholder="e.g. waiting on client reply"
              className="mt-3 w-full rounded-xl border border-line bg-hover/[0.04] p-3 text-sm text-ink placeholder:text-muted outline-none focus:border-brand-400"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setShowWaiting(false); setWaitingReason('') }}>
                Cancel
              </Button>
              <Button variant="primary" onClick={onMarkWaiting} disabled={!waitingReason.trim() || setWaiting.isPending}>
                {setWaiting.isPending ? <Spinner className="h-4 w-4" /> : <Pause className="h-4 w-4" />} Mark waiting
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
