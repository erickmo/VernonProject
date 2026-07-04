import { useNavigate } from 'react-router-dom'
import { ACTIONS } from '@/lib/actions'

// Gojek-style tile grid: every "what can I do" action as a tappable icon.
// `badges` is keyed by route (`to`) — only a couple of tiles carry a count.
export function QuickActions({ badges }: { badges?: Record<string, string | number> }) {
  const navigate = useNavigate()
  return (
    <div className="no-scrollbar -mx-4 mt-4 overflow-x-auto px-4 pt-3">
      <div className="grid grid-flow-col grid-rows-2 auto-cols-max gap-x-5 gap-y-4">
        {ACTIONS.map((a) => {
          const badge = badges?.[a.to]
          return (
            <button
              key={a.title}
              onClick={() => navigate(a.to)}
              className="flex w-[60px] flex-col items-center gap-1.5 transition active:scale-95"
            >
              <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shadow-card dark:bg-brand-500/15 dark:text-brand-300">
                <a.icon className="h-6 w-6" strokeWidth={2} />
                {badge != null && (
                  <span className="absolute -right-1.5 -top-1.5 min-w-[20px] rounded-full bg-brand-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow-sm">
                    {badge}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center text-[11px] font-semibold text-stone-600 dark:text-slate-300">
                {a.short}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
