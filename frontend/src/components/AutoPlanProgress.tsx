import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { formatEstimate } from '@/lib/format'
import type { AutoPlanSummary } from '@/hooks/usePlanDay'

// Blocking, centered dialog shown while Auto-plan writes today's allocations.
// Non-dismissable — the run is short and must not be cut off. Same portal/backdrop
// idiom as BulkProgressModal so it looks native in both frontends.
export function AutoPlanProgress({ open, summary }: { open: boolean; summary: AutoPlanSummary | null }) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-slate-900/50 animate-fade-in" />
      <div className="relative w-full max-w-xs animate-slide-up rounded-3xl bg-paper-card dark:bg-slate-800 p-6 text-center shadow-2xl">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
        <h2 className="mt-3 text-base font-bold text-stone-800 dark:text-slate-50">Planning your day…</h2>
        {summary && (
          <p className="mt-1 text-sm font-semibold text-stone-500 dark:text-slate-400">
            {summary.tasks} task{summary.tasks === 1 ? '' : 's'} · {formatEstimate(summary.minutes)}
            {summary.deadlines > 0 ? ` · ${summary.deadlines} due today` : ''}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
