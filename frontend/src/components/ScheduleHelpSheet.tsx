import { useEffect } from 'react'
import { X, HelpCircle } from 'lucide-react'
import { SCHEDULE_HELP, SCHEDULE_HELP_TITLE } from '@/lib/scheduleHelp'

// Bottom sheet explaining how shift templates + assignments work (Bahasa).
// Shell mirrors FilterSheet (backdrop + slide-up panel + grabber).
export function ScheduleHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={onClose} />
      <div className="relative max-h-[82vh] overflow-y-auto rounded-t-3xl bg-paper-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl animate-slide-up dark:bg-slate-800">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-800 dark:text-slate-100">
            <HelpCircle className="h-5 w-5 text-brand-600" /> {SCHEDULE_HELP_TITLE}
          </h2>
          <button onClick={onClose} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {SCHEDULE_HELP.map((s) => (
            <div key={s.heading}>
              <p className="mb-1 text-sm font-semibold text-brand-700 dark:text-brand-300">{s.heading}</p>
              <ul className="flex flex-col gap-1">
                {s.points.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm text-stone-600 dark:text-slate-300">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
