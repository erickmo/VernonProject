import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Clock, ChevronRight, CalendarDays, ArrowRight, Repeat, Play, Timer } from 'lucide-react'
import { STATUS } from '@/lib/status'
import { formatEstimate } from '@/lib/format'
import { Avatar, Pill } from './ui'
import { useAdvance } from '@/components/AdvanceProvider'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { openFocusOverlay } from '@/lib/focusUI'
import type { ProjectItem } from '@/lib/types'

interface Props {
  todo: ProjectItem
  // show the assignee avatar (review/team contexts) vs. hide (my own lists)
  showAssignee?: boolean
  showProject?: boolean
}

export function TodoCard({ todo, showAssignee, showProject = true }: Props) {
  const navigate = useNavigate()
  const advanceConfirm = useAdvance()
  const meta = STATUS[todo.status_key]
  // ponytail: this subscribes the card to the per-second timer tick, so every
  // visible card re-renders ~1×/s while a timer runs. Fine for the Today list's
  // handful of cards; if a screen ever renders hundreds, swap this for an
  // imperative store start that doesn't subscribe.
  const focus = useFocusTimer()
  const focusActive = focus.timer?.taskId === todo.name

  const startFocus = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!focusActive) focus.start(todo.name, todo.to_do, todo.estimated)
    openFocusOverlay({
      project: todo.project_name,
      deadlineHuman: todo.deadline_human || undefined,
      overdue: todo.is_overdue,
      estimateLabel: todo.estimated > 0 ? formatEstimate(todo.estimated) : undefined,
    })
  }

  const onAdvance = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (todo.next_status_label) advanceConfirm(todo.name, todo.next_status_label, todo.to_do)
  }

  return (
    <button
      onClick={() => navigate(`/project-item/${encodeURIComponent(todo.name)}`)}
      className={clsx(
        'group w-full rounded-2xl border-l-4 bg-paper-card dark:bg-slate-800 p-4 text-left shadow-card transition active:scale-[0.99]',
        todo.is_overdue ? 'border-rose-400' : meta.ring,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {showProject && (
            <p className="mb-1 truncate text-[11px] font-medium uppercase tracking-wide text-stone-400 dark:text-slate-500">
              {todo.project_name} · {todo.project_detail_title}
            </p>
          )}
          <p className="line-clamp-2 font-semibold leading-snug text-stone-800 dark:text-slate-100">{todo.to_do}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <span
              role="button"
              tabIndex={0}
              onClick={startFocus}
              title={focusActive ? 'Open focus timer' : 'Start focus timer'}
              className={clsx(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition active:scale-95',
                focusActive
                  ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                  : 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
              )}
            >
              {focusActive ? <Timer className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {focusActive ? 'Focusing' : 'Focus'}
            </span>
            <Pill className={meta.pill}>
              <span>{meta.emoji}</span>
              {meta.label}
            </Pill>
            {todo.is_recurring && (
              <span className="inline-flex items-center gap-0.5 text-violet-500" title="Recurring">
                <Repeat className="h-3.5 w-3.5" />
              </span>
            )}
            {todo.deadline && (
              <span
                className={clsx(
                  'inline-flex items-center gap-1',
                  todo.is_overdue ? 'font-semibold text-rose-600' : 'text-stone-500 dark:text-slate-400',
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {todo.is_overdue ? `Overdue · ${todo.deadline_human}` : todo.deadline_human}
              </span>
            )}
            {todo.estimated > 0 && (
              <span className="inline-flex items-center gap-1 text-stone-500 dark:text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                {formatEstimate(todo.estimated)}
              </span>
            )}
            {todo.today_allocation > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-500/15 px-2 py-0.5 font-semibold text-brand-700 dark:text-brand-300"
                title="Allocated for today"
              >
                <Clock className="h-3.5 w-3.5" />
                {formatEstimate(todo.today_allocation)} today
              </span>
            )}
          </div>
        </div>

        {showAssignee ? (
          <Avatar name={todo.assigned_to_name} image={todo.assigned_to_image} config={todo.assigned_to_avatar_config} size={34} />
        ) : (
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-stone-300 dark:text-slate-600" />
        )}
      </div>

      {todo.can_advance && todo.next_status_label && (
        <div className="mt-3 border-t border-paper-edge dark:border-slate-800 pt-3">
          <span
            onClick={onAdvance}
            role="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-50 dark:bg-brand-500/15 py-2.5 text-sm font-semibold text-brand-700 dark:text-brand-300 transition active:bg-brand-100 dark:active:bg-brand-500/20"
          >
            {todo.next_status_label}
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      )}
    </button>
  )
}
