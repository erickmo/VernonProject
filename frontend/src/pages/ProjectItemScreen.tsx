import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  FileText,
  History,
  Lock,
  Pencil,
  Repeat,
  Save,
  X,
} from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Avatar, FullScreenLoader, EmptyState, Spinner } from '@/components/ui'
import CommentThread from '@/components/CommentThread'
import { STATUS, STATUS_ORDER } from '@/lib/status'
import { formatEstimate, stripHtml } from '@/lib/format'
import { useAdvanceStatus, useProjectItem, useSaveNotes, useUpdateTodo, useScoringGroups, useScoringGroup } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { ProjectItemDetail } from '@/lib/types'

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
                  !active && !done && 'border-slate-200 bg-white text-slate-300',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : <span>{meta.emoji}</span>}
              </div>
              <span
                className={clsx(
                  'w-16 text-center text-[10px] font-medium leading-tight',
                  active ? 'text-brand-700' : 'text-slate-400',
                )}
              >
                {meta.label}
              </span>
            </div>
            {i < STATUS_ORDER.length - 1 && (
              <div className={clsx('-mt-5 h-0.5 flex-1', i < idx ? 'bg-emerald-500' : 'bg-slate-200')} />
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
  const [deadline, setDeadline] = useState(data.deadline ?? '')
  const [estimated, setEstimated] = useState(String(data.estimated || ''))
  const [pDC, setPDC] = useState(String(data.phase_estimates.done_to_checked || ''))
  const [pCC, setPCC] = useState(String(data.phase_estimates.checked_to_completed || ''))
  const [recurring, setRecurring] = useState(data.recurring.is_recurring)
  const [freq, setFreq] = useState(data.recurring.frequency || 'Weekly')
  const [until, setUntil] = useState(data.recurring.until ?? '')
  const [group, setGroup] = useState(data.group ?? '')
  const [level, setLevel] = useState(data.level ?? '')

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
    const fields: Record<string, unknown> = { to_do: toDo }
    if (!locked) {
      fields.assigned_to = assignee
      fields.deadline = deadline || null
      fields.estimated = estimated === '' ? 0 : Number(estimated)
    }
    // Approval-phase estimates in minutes (summed into the task total server-side).
    // Planned→Done is the main `estimated` field above.
    fields.estimated_done_to_checked = Number(pDC) || 0
    fields.estimated_checked_to_completed = Number(pCC) || 0
    // Recurring settings
    fields.is_recurring = recurring ? 1 : 0
    if (recurring) {
      fields.recurring_frequency = freq
      fields.recurring_until = until || ''
    }
    fields.group = group
    fields.level = level
    update.mutate(fields, {
      onSuccess: (res) => {
        toast('success', res.message)
        onClose()
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  const field = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[15px] text-slate-800 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 disabled:opacity-60'

  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">Edit todo</p>

      <label className="mb-1 block text-xs font-medium text-slate-500">Title</label>
      <textarea
        value={toDo}
        onChange={(e) => setToDo(e.target.value)}
        rows={2}
        className={clsx(field, 'mb-3 resize-none')}
      />

      <label className="mb-1 block text-xs font-medium text-slate-500">Assigned to</label>
      <select
        value={assignee}
        disabled={locked}
        onChange={(e) => setAssignee(e.target.value)}
        className={clsx(field, 'mb-3')}
      >
        {team.map((m) => (
          <option key={m.user} value={m.user}>
            {m.name}
          </option>
        ))}
      </select>

      <div className="mb-3 flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Deadline</label>
          <input
            type="date"
            value={deadline}
            disabled={locked}
            onChange={(e) => setDeadline(e.target.value)}
            className={field}
          />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs font-medium text-slate-500">Est. (min)</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={estimated}
            disabled={locked}
            onChange={(e) => setEstimated(e.target.value)}
            className={field}
          />
        </div>
      </div>

      {/* Approval time per phase (minutes) — Leader & Owner steps */}
      <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Approval time per phase (min)</span>
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">
            Total {phaseTotal || 0}m
          </span>
        </div>
        <div className="flex gap-2">
          {[
            { label: 'Leader → Checked', v: pDC, set: setPDC },
            { label: 'Owner → Completed', v: pCC, set: setPCC },
          ].map((p) => (
            <div key={p.label} className="flex-1">
              <label className="mb-1 block text-center text-[10px] font-medium text-slate-400">{p.label}</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step="1"
                value={p.v}
                onChange={(e) => p.set(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-center text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Recurring */}
      <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <label className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <Repeat className="h-4 w-4 text-slate-400" /> Repeat this todo
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
              <label className="mb-1 block text-xs font-medium text-slate-500">Frequency</label>
              <select value={freq} onChange={(e) => setFreq(e.target.value)} className={field}>
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Until (optional)</label>
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={field} />
            </div>
          </div>
        )}
      </div>

      <label className="mb-1 block text-xs font-medium text-slate-500">Group <span className="text-red-500">*</span></label>
      <div className="mb-3">
        <SearchableSelect
          value={group}
          onChange={setGroup}
          options={(groups ?? []).map((g) => ({ value: g.name, label: g.group_name }))}
          placeholder="Select a group…"
        />
      </div>

      <label className="mb-1 block text-xs font-medium text-slate-500">Level <span className="text-red-500">*</span></label>
      <div className="mb-3">
        <SearchableSelect
          value={level}
          onChange={setLevel}
          options={(groupDoc?.levels ?? []).map((l) => ({ value: l.level_name, label: `${l.level_name} (${l.point} pts)` }))}
          placeholder={group ? 'Select a level…' : 'Pick a group first…'}
          disabled={!group}
        />
      </div>

      {locked && (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Lock className="h-3.5 w-3.5" />
          Assignee, deadline &amp; estimate are locked once a todo is Done.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 active:bg-slate-200"
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
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{clean}</p>
    ) : (
      <p className="text-sm italic text-slate-400">No notes yet.</p>
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
        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
      />
      <div className="mt-1.5 flex h-5 items-center justify-end text-xs text-slate-400">
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

export default function ProjectItemScreen() {
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const id = decodeURIComponent(name)
  const { data, isLoading } = useProjectItem(id)
  const advance = useAdvanceStatus()
  const toast = useToast()
  const [editing, setEditing] = useState(false)

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

  const onAdvance = () =>
    advance.mutate(data.name, {
      onSuccess: (res) => toast('success', res.message),
      onError: (err) => toast('error', (err as Error).message),
    })

  const editBtn =
    data.can_edit && !editing ? (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-700 transition active:scale-95"
      >
        <Pencil className="h-4 w-4" /> Edit
      </button>
    ) : null

  return (
    <DetailScreen title="Todo" right={editBtn}>
      {editing ? (
        <EditForm data={data} onClose={() => setEditing(false)} />
      ) : (
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {data.project_name}
          </p>
          <Link
            to={`/project-detail/${encodeURIComponent(data.project_detail)}`}
            className="text-sm text-brand-600"
          >
            in {data.project_detail_title}
          </Link>
          <h2 className="mt-1 text-lg font-bold leading-snug text-slate-900">{data.to_do}</h2>

          {(data.is_missed || data.recurring.is_recurring || data.phase_estimates.total > 0) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {data.is_missed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
                  <AlertCircle className="h-3.5 w-3.5" /> Missed occurrence
                </span>
              )}
              {data.recurring.is_recurring && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
                  <Repeat className="h-3.5 w-3.5" /> Repeats {data.recurring.frequency?.toLowerCase()}
                </span>
              )}
              {data.phase_estimates.total > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700">
                  <Clock className="h-3.5 w-3.5" /> {formatEstimate(data.phase_estimates.total)} total
                </span>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <Avatar name={data.assigned_to_name} image={data.assigned_to_image} size={24} />
              {data.assigned_to_name}
            </span>
            {data.deadline && (
              <span
                className={clsx(
                  'inline-flex items-center gap-1.5',
                  data.is_overdue ? 'font-semibold text-rose-600' : 'text-slate-500',
                )}
              >
                <CalendarDays className="h-4 w-4" />
                {data.is_overdue ? `Overdue · ${data.deadline_human}` : data.deadline_human}
              </span>
            )}
            {data.estimated > 0 && (
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <Clock className="h-4 w-4" /> {formatEstimate(data.estimated)}
              </span>
            )}
          </div>
          {data.group && (
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium">Group:</span> {data.group}
              {data.level ? ` · ${data.level}` : ''}
              {data.point ? ` (${data.point} pts)` : ''}
            </p>
          )}
        </div>
      )}

      {/* Workflow */}
      <div className="mt-4 rounded-2xl bg-white p-4 pb-5 shadow-card">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Workflow</p>
        <Stepper current={data.status_key} />

        {data.status_key !== 'completed' &&
          (data.can_advance ? (
            <button
              onClick={onAdvance}
              disabled={advance.isPending}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition active:bg-brand-700 disabled:opacity-60"
            >
              {advance.isPending ? (
                <Spinner className="h-5 w-5" />
              ) : (
                <>
                  {data.next_status_label}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          ) : (
            <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-slate-50 py-3 text-sm text-slate-400">
              <Lock className="h-4 w-4" />
              Waiting on someone else to advance this
            </div>
          ))}
      </div>

      {/* Recurrence history */}
      {data.occurrences.length > 1 && (
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-card">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Repeat className="h-3.5 w-3.5" /> Recurrence history ({data.occurrences.length})
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
                      o.is_current ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-slate-50 active:bg-slate-100',
                    )}
                  >
                    <span>{meta.emoji}</span>
                    <span className="flex-1 text-slate-600">{o.deadline_human || '—'}</span>
                    {o.is_current ? (
                      <span className="text-[11px] font-semibold text-brand-600">This one</span>
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
      <div className="mt-4 rounded-2xl bg-white p-4 shadow-card">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <FileText className="h-3.5 w-3.5" /> Notes
        </p>
        <Notes todoId={data.name} initial={data.notes} canEdit={data.can_edit_notes} />
      </div>

      {/* Timeline */}
      {data.timeline.length > 0 && (
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-card">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <History className="h-3.5 w-3.5" /> Activity
          </p>
          <ol className="space-y-3">
            {data.timeline.map((e, i) => (
              <li key={i} className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="text-sm">
                  <p className="font-medium text-slate-700">
                    {e.label} <span className="font-normal text-slate-400">by {e.by_name}</span>
                  </p>
                  <p className="text-xs text-slate-400">{e.at_human}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <CommentThread referenceDoctype="Project Todo" referenceName={id} />
    </DetailScreen>
  )
}
