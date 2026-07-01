import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCheck } from 'lucide-react'
import { Avatar, ProgressBar } from './ui'
import { formatDate, formatEstimateRatio } from '@/lib/format'
import type { ProjectCard as ProjectCardType } from '@/lib/types'

export function ProjectCard({ p }: { p: ProjectCardType }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(`/project/${encodeURIComponent(p.name)}`)}
      className="w-full rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 text-left shadow-card transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-stone-800 dark:text-slate-100">{p.project_name}</p>
          <span className="mt-1 inline-block rounded-md bg-paper-line dark:bg-slate-700 px-2 py-0.5 text-[11px] font-medium text-stone-500 dark:text-slate-400">
            {p.brand}
          </span>
        </div>
        {p.review > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
            <CheckCheck className="h-3.5 w-3.5" />
            {p.review} to review
          </span>
        ) : (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              p.status === 'Ongoing' ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-paper-line dark:bg-slate-700 text-stone-500 dark:text-slate-400'
            }`}
          >
            {p.status}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <ProgressBar value={p.progress} />
        <span className="shrink-0 text-xs font-semibold text-stone-500 dark:text-slate-400">{p.progress}%</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="font-medium text-stone-600 dark:text-slate-300">
            {formatEstimateRatio(p.minutes_done, p.minutes_total)}
          </span>
          <span className="text-stone-400 dark:text-slate-500">
            {p.item_done}/{p.item_total} todos
          </span>
          {p.overdue > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-rose-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {p.overdue}
            </span>
          )}
        </div>
        <span className="text-stone-400 dark:text-slate-500">Due {formatDate(p.deadline)}</span>
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-paper-edge dark:border-slate-800 pt-3 text-xs">
        <span className="flex items-center gap-1.5 text-stone-500 dark:text-slate-400">
          <Avatar name={p.owner_name} image={p.owner_image} config={p.owner_avatar_config} size={20} />
          <span className="text-stone-400 dark:text-slate-500">Owner</span>
          <span className="font-medium text-stone-600 dark:text-slate-300">{p.owner_name}</span>
        </span>
        <span className="flex items-center gap-1.5 text-stone-500">
          <Avatar name={p.leader_name} image={p.leader_image} config={p.leader_avatar_config} size={20} />
          <span className="text-stone-400 dark:text-slate-500">Lead</span>
          <span className="font-medium text-stone-600 dark:text-slate-300">{p.leader_name}</span>
        </span>
      </div>
    </button>
  )
}
