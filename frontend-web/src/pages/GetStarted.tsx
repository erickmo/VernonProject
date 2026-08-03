import { type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Sparkles, Palette, Check, ChevronRight, PartyPopper } from 'lucide-react'
import { useBoot } from '@/hooks/useData'
import { getStartedSteps, getStartedProgress, type GetStartedStep } from '@/lib/getStarted'

const ICONS: Record<GetStartedStep['key'], ComponentType<{ className?: string }>> = {
  profile: User,
  superpower: Sparkles,
  avatar: Palette,
}

// Guided setup checklist (web). Same shared step logic as /m; bento-flavoured
// card list. Auto-shown once on first login by App.tsx; re-reachable from the
// "Get started" tile on the Me screen.
export default function GetStarted() {
  const navigate = useNavigate()
  const { data: b } = useBoot()
  if (!b) return null

  const steps = getStartedSteps(b)
  const { done, total } = getStartedProgress(b)
  const allDone = done === total

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Get started</h1>
        <p className="mt-1 text-sm text-muted">
          {allDone
            ? "You're all set — nice work! 🎉"
            : 'A few quick things to get you set up. You can do these anytime.'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-brand-600 transition-all duration-500"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        <span className="text-xs font-semibold tabular-nums text-brand-600 dark:text-brand-400">
          {done}/{total}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {steps.map((s) => {
          const Icon = ICONS[s.key]
          return (
            <button
              key={s.key}
              onClick={() => navigate(s.href)}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left shadow-card transition hover:bg-hover/[0.03] active:scale-[0.99]"
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
                <p className={`text-sm font-semibold ${s.done ? 'text-muted line-through' : 'text-ink'}`}>
                  {s.label}
                </p>
                <p className="text-xs text-muted">{s.done ? 'Done' : s.desc}</p>
              </div>
              {!s.done && <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />}
            </button>
          )
        })}
      </div>

      {allDone ? (
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <PartyPopper className="h-4 w-4" /> Go to app
        </button>
      ) : (
        <button
          onClick={() => navigate('/')}
          className="self-start text-sm font-medium text-muted hover:text-ink"
        >
          Skip for now
        </button>
      )}
    </div>
  )
}
