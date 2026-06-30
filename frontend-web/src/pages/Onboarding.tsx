import { useState } from 'react'
import clsx from 'clsx'
import { Home, MousePointerClick, CheckCheck, ArrowRight, ArrowLeft } from 'lucide-react'
import { useModalA11y } from '@web/lib/useModalA11y'

const SLIDES = [
  {
    icon: Home,
    title: 'Your day, at a glance',
    body: 'The Today view shows everything assigned to you — overdue, due today, and upcoming. No hunting through projects.',
    accent: 'from-brand-500 to-brand-700',
  },
  {
    icon: MousePointerClick,
    title: 'Move work forward in one click',
    body: 'Click the action to advance a task: Planned → Done → Leader approved → Owner approved. A team member marks it Done; the leader then the owner approve. You only see the steps you’re allowed to take.',
    accent: 'from-amber-500 to-orange-600',
  },
  {
    icon: CheckCheck,
    title: 'Review what needs you',
    body: 'Leaders get a Review screen with everything waiting for their approval, most urgent first. Approve with a single click.',
    accent: 'from-emerald-500 to-teal-600',
  },
]

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const slide = SLIDES[i]
  const Icon = slide.icon
  const last = i === SLIDES.length - 1
  const ref = useModalA11y(true, onDone)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/50" onClick={onDone} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Vernon"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-lg bg-surface shadow-xl flex flex-col"
      >
        <div className="flex justify-end px-5 pt-4">
          <button onClick={onDone} className="text-sm font-medium text-muted hover:text-slate-600 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            Skip
          </button>
        </div>

        <div className="flex flex-col items-center justify-center px-8 pt-2 pb-6 text-center">
          <div
            className={clsx(
              'mb-8 flex h-28 w-28 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-lg',
              slide.accent,
            )}
          >
            <Icon className="h-12 w-12" strokeWidth={1.8} />
          </div>
          <h2 className="text-2xl font-bold text-ink">{slide.title}</h2>
          <p className="mt-3 max-w-xs leading-relaxed text-muted">{slide.body}</p>
        </div>

        <div className="px-8 pb-8">
          <div className="mb-6 flex justify-center gap-2">
            {SLIDES.map((_, idx) => (
              <span
                key={idx}
                className={clsx(
                  'h-2 rounded-full transition-all',
                  idx === i ? 'w-6 bg-brand-600' : 'w-2 bg-slate-200 dark:bg-slate-700',
                )}
              />
            ))}
          </div>
          <div className="flex gap-3">
            {i > 0 && (
              <button
                onClick={() => setI(i - 1)}
                className="flex items-center justify-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-5 py-3.5 text-base font-semibold text-muted hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <ArrowLeft className="h-5 w-5" /> Back
              </button>
            )}
            <button
              onClick={() => (last ? onDone() : setI(i + 1))}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {last ? 'Get started' : 'Next'}
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
