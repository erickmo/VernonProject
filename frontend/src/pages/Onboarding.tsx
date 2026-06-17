import { useState } from 'react'
import clsx from 'clsx'
import { Home, MousePointerClick, CheckCheck, ArrowRight } from 'lucide-react'

const SLIDES = [
  {
    icon: Home,
    title: 'Your day, at a glance',
    body: 'The Today tab shows everything assigned to you — overdue, due today, and upcoming. No hunting through projects.',
    accent: 'from-brand-500 to-brand-700',
  },
  {
    icon: MousePointerClick,
    title: 'Move work forward in one tap',
    body: 'Tap the action to advance a task: Planned → Done → Leader approved → Owner approved. A team member marks it Done; the leader then the owner approve. You only see the steps you’re allowed to take.',
    accent: 'from-amber-500 to-orange-600',
  },
  {
    icon: CheckCheck,
    title: 'Review what needs you',
    body: 'Leaders get a Review tab with everything waiting for their approval, most urgent first. Approve with a single tap.',
    accent: 'from-emerald-500 to-teal-600',
  },
]

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const slide = SLIDES[i]
  const Icon = slide.icon
  const last = i === SLIDES.length - 1

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white pt-[env(safe-area-inset-top)] animate-fade-in">
      <div className="flex justify-end px-5 pt-4">
        <button onClick={onDone} className="text-sm font-medium text-slate-400">
          Skip
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div
          className={clsx(
            'mb-8 flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-br text-white shadow-lg',
            slide.accent,
          )}
        >
          <Icon className="h-12 w-12" strokeWidth={1.8} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">{slide.title}</h2>
        <p className="mt-3 max-w-xs leading-relaxed text-slate-500">{slide.body}</p>
      </div>

      <div className="px-8 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div className="mb-6 flex justify-center gap-2">
          {SLIDES.map((_, idx) => (
            <span
              key={idx}
              className={clsx(
                'h-2 rounded-full transition-all',
                idx === i ? 'w-6 bg-brand-600' : 'w-2 bg-slate-200',
              )}
            />
          ))}
        </div>
        <button
          onClick={() => (last ? onDone() : setI(i + 1))}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4 text-base font-semibold text-white shadow-sm active:bg-brand-700"
        >
          {last ? 'Get started' : 'Next'}
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
