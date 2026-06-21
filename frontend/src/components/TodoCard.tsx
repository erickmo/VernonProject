import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Clock, ChevronRight, CalendarDays, ArrowRight, Repeat } from 'lucide-react'
import { STATUS } from '@/lib/status'
import { formatEstimate } from '@/lib/format'
import { Avatar, Pill, Spinner } from './ui'
import { useAdvanceStatus } from '@/hooks/useData'
import { useToast } from './Toast'
import type { ProjectItem } from '@/lib/types'

interface Props {
  todo: ProjectItem
  // show the assignee avatar (review/team contexts) vs. hide (my own lists)
  showAssignee?: boolean
  showProject?: boolean
}

export function TodoCard({ todo, showAssignee, showProject = true }: Props) {
  const navigate = useNavigate()
  const advance = useAdvanceStatus()
  const toast = useToast()
  const meta = STATUS[todo.status_key]

  const onAdvance = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (advance.isPending) return
    advance.mutate(todo.name, {
      onSuccess: (res) => toast('success', res.message),
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  return (
    <button
      onClick={() => navigate(`/project-item/${encodeURIComponent(todo.name)}`)}
      className={clsx(
        'group w-full rounded-2xl border-l-4 bg-white p-4 text-left shadow-card transition active:scale-[0.99]',
        todo.is_overdue ? 'border-rose-400' : meta.ring,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {showProject && (
            <p className="mb-1 truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {todo.project_name} · {todo.project_detail_title}
            </p>
          )}
          <p className="line-clamp-2 font-semibold leading-snug text-slate-800">{todo.to_do}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
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
                  todo.is_overdue ? 'font-semibold text-rose-600' : 'text-slate-500',
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {todo.is_overdue ? `Overdue · ${todo.deadline_human}` : todo.deadline_human}
              </span>
            )}
            {todo.estimated > 0 && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Clock className="h-3.5 w-3.5" />
                {formatEstimate(todo.estimated)}
              </span>
            )}
            {todo.today_allocation > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700"
                title="Allocated for today"
              >
                <Clock className="h-3.5 w-3.5" />
                {formatEstimate(todo.today_allocation)} today
              </span>
            )}
          </div>
        </div>

        {showAssignee ? (
          <Avatar name={todo.assigned_to_name} image={todo.assigned_to_image} size={34} />
        ) : (
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300" />
        )}
      </div>

      {todo.can_advance && todo.next_status_label && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <span
            onClick={onAdvance}
            role="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-50 py-2.5 text-sm font-semibold text-brand-700 transition active:bg-brand-100"
          >
            {advance.isPending ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <>
                {todo.next_status_label}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </span>
        </div>
      )}
    </button>
  )
}
