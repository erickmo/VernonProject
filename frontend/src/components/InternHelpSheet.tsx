import { useEffect } from 'react'
import { X, HelpCircle } from 'lucide-react'
import { INTERN_HELP, internHelp } from '@/lib/internAllocation'

// (i) explanations for the Intern Allocation report. Opens on one term and lists the
// rest below it, so a reader who tapped "Hari kosong" can keep reading without hunting.
// Shell mirrors ScheduleHelpSheet (backdrop + slide-up panel + grabber).
export function InternHelpSheet({ term, onClose }: { term: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!term) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [term])

  if (!term) return null
  const focused = internHelp(term)
  const rest = INTERN_HELP.filter((h) => h.term !== term)

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={focused?.title ?? 'Penjelasan'}
        className="relative max-h-[82vh] overflow-y-auto rounded-t-3xl bg-paper-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl animate-slide-up dark:bg-slate-800"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-800 dark:text-slate-100">
            <HelpCircle className="h-5 w-5 shrink-0 text-brand-600" />
            {focused?.title ?? 'Penjelasan'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {focused && (
          <p className="mb-5 rounded-2xl bg-brand-50 p-3.5 text-sm leading-relaxed text-stone-700 dark:bg-brand-500/10 dark:text-slate-200">
            {focused.body}
          </p>
        )}

        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
          Istilah lain
        </p>
        <div className="flex flex-col gap-3.5">
          {rest.map((h) => (
            <div key={h.term}>
              <p className="mb-0.5 text-sm font-semibold text-stone-800 dark:text-slate-100">{h.title}</p>
              <p className="text-sm leading-relaxed text-stone-500 dark:text-slate-400">{h.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
