import { createPortal } from 'react-dom'
import { Loader2, Check, X } from 'lucide-react'

type Result = { ok: number; failed: number }

// Frozen, centered progress dialog for bulk approve/reject. While running it is
// non-dismissable (no backdrop close, no button) so the batch can't be cut off;
// on completion a summary + Done button is the only way out.
export function BulkProgressModal({
  open,
  verb,
  progress,
  result,
  accent = 'brand',
  onDone,
}: {
  open: boolean
  verb: 'Approving' | 'Rejecting'
  progress: { done: number; total: number } | null
  result: Result | null
  accent?: 'brand' | 'rose'
  onDone: () => void
}) {
  if (!open) return null
  const total = progress?.total ?? (result ? result.ok + result.failed : 0)
  const pct = result ? 100 : progress && progress.total ? (progress.done / progress.total) * 100 : 0
  const past = verb === 'Rejecting' ? 'Rejected' : 'Approved'
  const spin = accent === 'rose' ? 'text-rose-500' : 'text-brand-600'
  const bar = accent === 'rose' ? 'bg-rose-500' : 'bg-brand-600'

  // Portal to <body>: escapes any transformed/animated ancestor so `fixed`
  // centers on the real viewport and the backdrop covers the full page.
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-6">
      {/* Backdrop is intentionally inert — clicking outside must NOT cancel the run. */}
      <div className="absolute inset-0 bg-slate-900/50 animate-fade-in" />
      <div className="relative w-full max-w-xs animate-slide-up rounded-3xl bg-paper-card dark:bg-slate-800 p-6 text-center shadow-2xl">
        {result ? (
          <>
            <div
              className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
                result.failed
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
                  : accent === 'rose'
                    ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
                    : 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300'
              }`}
            >
              {accent === 'rose' ? <X className="h-6 w-6" /> : <Check className="h-6 w-6" />}
            </div>
            <h2 className="mt-3 text-lg font-bold text-stone-800 dark:text-slate-50">
              {past} {result.ok}
            </h2>
            {result.failed > 0 && (
              <p className="mt-1 text-sm font-semibold text-amber-600 dark:text-amber-400">{result.failed} failed</p>
            )}
            <button
              onClick={onDone}
              className="mt-5 w-full rounded-2xl bg-brand-600 py-3 text-sm font-semibold text-white active:bg-brand-700"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <Loader2 className={`mx-auto h-8 w-8 animate-spin ${spin}`} />
            <h2 className="mt-3 text-base font-bold text-stone-800 dark:text-slate-50">{verb}…</h2>
            {progress && (
              <>
                <div className="mt-1 text-sm font-semibold text-stone-500 dark:text-slate-400">
                  {progress.done} / {total}
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-paper-line dark:bg-slate-700">
                  <div className={`h-full rounded-full ${bar} transition-[width] duration-200`} style={{ width: `${pct}%` }} />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
