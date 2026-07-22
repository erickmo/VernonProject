import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { AlarmClock, Mail, Phone, BellRing } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useTodosDue, useBuzzTodo } from '@/hooks/useData'
import { useReportRowMenu } from '@/hooks/useReportRowMenu'
import { useHoldFeedback } from '@/hooks/useHoldFeedback'
import { formatDate } from '@/lib/format'

type DueRow = NonNullable<ReturnType<typeof useTodosDue>['data']>['rows'][number]

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'
const card = 'rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800'

/** Local YYYY-MM-DD, `days` from today. Default cutoff = the coming week. */
function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}

// One "due" card. Tap opens the task; long-press (touch) or right-click opens the
// shared todo context menu — same affordance as the todo cards elsewhere.
function DueCard({
  row,
  buzzing,
  onBuzz,
  openRowMenu,
}: {
  row: DueRow
  buzzing: boolean
  onBuzz: (todo: string, name: string) => void
  openRowMenu: ((id: string, at: { x: number; y: number }) => void) | null
}) {
  const navigate = useNavigate()
  const hold = useHoldFeedback((pt) => openRowMenu?.(row.todo, pt))
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <div
      onClick={() => {
        if (hold.longFired.current) {
          hold.longFired.current = false
          return
        }
        navigate(`/project-item/${encodeURIComponent(row.todo)}`)
      }}
      onContextMenu={
        openRowMenu
          ? (e) => {
              e.preventDefault()
              openRowMenu(row.todo, { x: e.clientX, y: e.clientY })
            }
          : undefined
      }
      {...(openRowMenu ? hold.bind : {})}
      className={clsx(card, 'cursor-pointer transition', hold.holding && 'ring-2 ring-brand-400/70 dark:ring-brand-500/50')}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 font-semibold text-stone-800 dark:text-slate-100">{row.to_do}</p>
        <p className={`shrink-0 text-sm font-bold ${row.overdue ? 'text-rose-600' : 'text-slate-600 dark:text-slate-300'}`}>
          {row.deadline ? formatDate(row.deadline) : '—'}
          {row.overdue ? ' · overdue' : ''}
        </p>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {row.project_name} · {row.status}{row.my_role ? ` · you: ${row.my_role}` : ''}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-medium text-stone-700 dark:text-slate-200">{row.assignee_name}</span>
        {row.assignee_email ? (
          <a href={`mailto:${row.assignee_email}`} onClick={stop} className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-300">
            <Mail className="h-3.5 w-3.5" /> {row.assignee_email}
          </a>
        ) : null}
        {row.assignee_mobile ? (
          <a href={`tel:${row.assignee_mobile}`} onClick={stop} className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-300">
            <Phone className="h-3.5 w-3.5" /> {row.assignee_mobile}
          </a>
        ) : null}
      </div>
      <button
        onClick={(e) => { stop(e); onBuzz(row.todo, row.assignee_name) }}
        onPointerDown={stop}
        disabled={buzzing}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-brand-600 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 transition active:scale-95 disabled:opacity-50 dark:bg-brand-500/15 dark:text-brand-300"
      >
        {buzzing ? <Spinner className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
        Buzz
      </button>
    </div>
  )
}

export default function TodosDueScreen() {
  const [dueBy, setDueBy] = useState(() => todayPlus(7))
  const [project, setProject] = useState('') // '' = all projects
  const { data, isFetching } = useTodosDue(dueBy, !!dueBy)
  const toast = useToast()
  const buzz = useBuzzTodo()
  const openRowMenu = useReportRowMenu()

  const allRows = data?.rows ?? []
  // Distinct projects present in the current result, for the filter dropdown.
  const projects = useMemo(
    () => Array.from(new Map(allRows.map((r) => [r.project, r.project_name])).entries()),
    [allRows],
  )
  // Clamp: if the selected project vanished from the new result (date change / refetch),
  // fall back to all rows so the counts + empty state stay honest.
  const rows =
    project && allRows.some((r) => r.project === project)
      ? allRows.filter((r) => r.project === project)
      : allRows
  const overdue = rows.reduce((n, r) => n + (r.overdue ? 1 : 0), 0)

  function onBuzz(todo: string, name: string) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30) // sender haptic
    buzz.mutate(todo, {
      onSuccess: () => toast('success', `Buzzed ${name}`),
      onError: (e) => toast('error', (e as Error).message || 'Buzz failed'),
    })
  }

  return (
    <DetailScreen title="Todos Due">
      <div className="flex flex-col gap-4">
        <div className={`${card} flex flex-col gap-3`}>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Due by
              <input type="date" className={field} value={dueBy} onChange={(e) => setDueBy(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Project
              <SearchableSelect
                value={project}
                onChange={(v) => setProject(v)}
                options={projects.map(([id, name]) => ({ value: id, label: name }))}
                placeholder="All projects"
                allowClear
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Open todos in projects you own, lead, or admin with a deadline on or before this date
            (overdue included), soonest first. Tap Buzz to nudge the assignee.
          </p>
        </div>

        {data && (
          <div className="grid grid-cols-2 gap-3">
            <div className={`${card} text-center`}>
              <p className="text-xl font-bold text-brand-600">{rows.length}</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Todos Due</p>
            </div>
            <div className={`${card} text-center`}>
              <p className="text-xl font-bold text-rose-600">{overdue}</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Overdue</p>
            </div>
          </div>
        )}

        {isFetching && !data ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !data ? null : rows.length === 0 ? (
          <EmptyState icon={AlarmClock} title="Nothing due." subtitle="No open todos to chase — or you don't own, lead, or admin any project." />
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <DueCard
                key={row.todo}
                row={row}
                buzzing={buzz.isPending && buzz.variables === row.todo}
                onBuzz={onBuzz}
                openRowMenu={openRowMenu}
              />
            ))}
          </div>
        )}

        {isFetching && data && (
          <div className="flex justify-center"><Spinner className="h-4 w-4 text-brand-500" /></div>
        )}
      </div>
    </DetailScreen>
  )
}
