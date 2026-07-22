import clsx from 'clsx'
import type { MouseEvent } from 'react'
import { Play, Timer, Plus, Check } from 'lucide-react'
import {
  StatusCell,
  EditableAssigneeCell,
  EditableDateCell,
  type Column,
} from '@web/components/DataTable'
import { useFocusPill } from '@/hooks/useFocusPill'
import { useTodoContextMenu } from '@/hooks/useTodoMenu'
import { useToast } from '@/components/Toast'
import { useSetTodoAllocations } from '@/hooks/useData'
import { buildNext } from '@/lib/planDay'
import { formatEstimate, todayISO } from '@/lib/format'
import { ListProgress } from '@web/components/PlanList'
import type { ProjectItem } from '@/lib/types'

// Completion progress for a work-package's todos — done vs. total (minutes, with
// a count fallback). Same progress bar as the /w Home + Review lists; render it
// above the grouped todo tables. Cancelled rows are excluded from the total.
export function TodoProgress({ items }: { items: ProjectItem[] }) {
  const notCancelled = items.filter((t) => t.status_key !== 'cancelled')
  const total = notCancelled.length
  if (!total) return null
  const doneRows = notCancelled.filter((t) => t.status_key === 'completed')
  const minDone = doneRows.reduce((s, t) => s + (t.estimated || 0), 0)
  const minTotal = notCancelled.reduce((s, t) => s + (t.estimated || 0), 0)
  const pct = minTotal ? Math.round((minDone / minTotal) * 100) : Math.round((doneRows.length / total) * 100)
  return (
    <ListProgress
      title="Progress"
      note={`${doneRows.length} of ${total} done`}
      pct={pct}
      doneText={minDone > 0 ? `${formatEstimate(minDone)} done` : 'nothing done yet'}
      leftText={minTotal - minDone > 0 ? `${formatEstimate(minTotal - minDone)} left` : 'all wrapped up'}
    />
  )
}

// ponytail: shared by the standalone ProjectDetail page and the embedded
// workspace todos pane — stable const, defined once.
export const TODO_COLUMNS: Column<ProjectItem>[] = [
  {
    key: 'task',
    header: 'Task',
    sortValue: (r) => r.to_do,
    render: (r) => (
      <span
        className={
          r.status_key === 'cancelled'
            ? 'text-muted line-through'
            : r.is_overdue
            ? 'font-medium text-rose-700 dark:text-rose-400'
            : 'font-medium text-ink'
        }
      >
        {r.to_do}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: 'w-44',
    render: (r) => <StatusCell todo={r} />,
  },
  {
    key: 'assignee',
    header: 'Assignee',
    width: 'w-36',
    render: (r) => <EditableAssigneeCell todo={r} />,
  },
  {
    key: 'deadline',
    header: 'Deadline',
    width: 'w-36',
    sortValue: (r) => r.deadline ?? '',
    render: (r) => <EditableDateCell todo={r} field="deadline" />,
  },
  {
    key: 'plan',
    header: '',
    width: 'w-44',
    // Today + Focus quick-actions — parity with the mobile TodoCard / Home list.
    // Open todos only (planning/focusing a done or cancelled task is meaningless).
    render: (r) =>
      r.status_key === 'completed' || r.status_key === 'cancelled'
        ? null
        : <TodoActionsCell todo={r} />,
  },
]

// Row-level right-click → open the shared todo context menu at the cursor. Exposed
// as a hook (not baked into TODO_COLUMNS) because useTodoContextMenu is a hook: call
// this in the component that renders the todo DataTable and pass the result to
// <DataTable onRowContextMenu>. Returns undefined when no menu provider is mounted,
// so the table stays inert on screens without the menu.
export function useTodoRowContextMenu(): ((row: ProjectItem, e: MouseEvent) => void) | undefined {
  const menu = useTodoContextMenu()
  if (!menu) return undefined
  return (row, e) => {
    e.preventDefault()
    menu.open(row, { x: e.clientX, y: e.clientY })
  }
}

// +Today (allocate today's minutes) + Focus (start/open the timer) for one row.
// Reuses the exact logic from the shared mobile TodoCard so behavior matches.
// ponytail: each cell subscribes to the 1s focus tick (via useFocusPill); fine
// for a project's todo list, revisit if a table ever renders hundreds of rows.
function TodoActionsCell({ todo }: { todo: ProjectItem }) {
  const { focusActive, focusMode, onFocusPill } = useFocusPill(todo)
  const toast = useToast()
  const setAlloc = useSetTodoAllocations(todo.name)
  const planned = todo.today_allocation > 0

  return (
    <span className="inline-flex items-center gap-1.5">
      {/* Only the assignee sets the day-plan (backend enforces it too). */}
      {todo.is_mine && (
      <button
        type="button"
        disabled={setAlloc.isPending}
        title={planned ? 'Remove from today' : 'Add to today'}
        onClick={(e) => {
          e.stopPropagation()
          if (setAlloc.isPending) return
          const minutes = planned ? 0 : todo.estimated > 0 ? todo.estimated : 30
          setAlloc.mutate(buildNext(todo.allocations ?? [], todayISO(), minutes), {
            onError: (err) => toast('error', (err as Error).message),
          })
        }}
        className={clsx(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition active:scale-95',
          setAlloc.isPending && 'opacity-50',
          planned
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
            : 'bg-stone-100 text-stone-600 dark:bg-slate-700 dark:text-slate-300',
        )}
      >
        {planned ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        {planned ? formatEstimate(todo.today_allocation) : 'Today'}
      </button>
      )}
      <button
        type="button"
        title={focusActive ? (focusMode === 'fullscreen' ? 'Open focus timer' : 'Stop focus timer') : 'Start focus timer'}
        onClick={onFocusPill}
        className={clsx(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition active:scale-95',
          focusActive
            ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
            : 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
        )}
      >
        {focusActive ? <Timer className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {focusActive ? 'Focusing' : 'Focus'}
      </button>
    </span>
  )
}

/** Split a detail's todos into Open / Completed / (Cancelled) groups. */
export function todoGroupsOf(items: ProjectItem[], showCancelled: boolean) {
  const visibleItems = showCancelled ? items : items.filter((t) => t.status_key !== 'cancelled')
  const todoGroups = [
    {
      label: 'Open',
      rows: visibleItems.filter((t) => t.status_key !== 'completed' && t.status_key !== 'cancelled'),
    },
    { label: 'Completed', rows: visibleItems.filter((t) => t.status_key === 'completed') },
    ...(showCancelled
      ? [{ label: 'Cancelled', rows: visibleItems.filter((t) => t.status_key === 'cancelled') }]
      : []),
  ].filter((g) => g.rows.length > 0)
  return { visibleItems, todoGroups }
}
