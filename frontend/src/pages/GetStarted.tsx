import { type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Sparkles, Palette, Check, ChevronRight, PartyPopper } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { ProgressBar } from '@/components/ui'
import { useBoot } from '@/hooks/useData'
import { getStartedSteps, getStartedProgress, type GetStartedStep } from '@/lib/getStarted'

const ICONS: Record<GetStartedStep['key'], ComponentType<{ className?: string }>> = {
  profile: User,
  superpower: Sparkles,
  avatar: Palette,
}

// Guided setup checklist. Each step deep-links to where you do it; done-state is
// derived live from boot (see lib/getStarted). Reached on first login (App.tsx
// auto-shows it once) and from the "Get started" link in the Me screen.
export default function GetStarted() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  if (!boot) return <DetailScreen title="Get started"><div /></DetailScreen>

  const steps = getStartedSteps(boot)
  const { done, total } = getStartedProgress(boot)
  const allDone = done === total

  return (
    <DetailScreen title="Get started">
      <div className="mb-5">
        <p className="text-sm text-stone-500 dark:text-slate-400">
          {allDone
            ? "You're all set — nice work! 🎉"
            : 'A few quick things to get you set up. You can do these anytime.'}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar value={(done / total) * 100} />
          </div>
          <span className="text-xs font-semibold tabular-nums text-brand-600 dark:text-brand-400">
            {done}/{total}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((s) => {
          const Icon = ICONS[s.key]
          return (
            <button
              key={s.key}
              onClick={() => navigate(s.href)}
              className="flex w-full items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 text-left shadow-card transition active:scale-[0.99]"
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  s.done
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                    : 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300'
                }`}
              >
                {s.done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${
                    s.done
                      ? 'text-stone-400 line-through dark:text-slate-500'
                      : 'text-stone-800 dark:text-slate-100'
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-xs text-stone-400 dark:text-slate-500">{s.done ? 'Done' : s.desc}</p>
              </div>
              {!s.done && <ChevronRight className="h-4 w-4 shrink-0 text-stone-300 dark:text-slate-600" />}
            </button>
          )
        })}
      </div>

      {allDone ? (
        <button
          onClick={() => navigate('/')}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 text-base font-semibold text-white shadow-sm active:bg-brand-700"
        >
          <PartyPopper className="h-5 w-5" /> Go to app
        </button>
      ) : (
        <button
          onClick={() => navigate('/')}
          className="mt-6 w-full rounded-2xl py-3 text-sm font-medium text-stone-400 dark:text-slate-500"
        >
          Skip for now
        </button>
      )}
    </DetailScreen>
  )
}
