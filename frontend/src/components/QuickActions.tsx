import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ACTIONS, type ActionItem } from '@/lib/actions'
import { useHoldFeedback } from '@/hooks/useHoldFeedback'

// Gojek-style tile grid: every "what can I do" action as a tappable icon.
// `badges` is keyed by route (`to`) — only a couple of tiles carry a count.
export function QuickActions({ badges }: { badges?: Record<string, string | number> }) {
  return (
    <div className="no-scrollbar -mx-4 mt-4 overflow-x-auto px-4 pt-3">
      <div className="grid grid-flow-col grid-rows-2 auto-cols-max gap-x-5 gap-y-4">
        {ACTIONS.map((a) => (
          <Tile key={a.title} action={a} badge={badges?.[a.to]} />
        ))}
      </div>
    </div>
  )
}

// Tap navigates; long-press (touch) plays a press-in + pop and swallows the
// trailing click, so a hold is pure tactile feedback — never an accidental nav.
function Tile({ action: a, badge }: { action: ActionItem; badge?: string | number }) {
  const navigate = useNavigate()
  const hold = useHoldFeedback()
  return (
    <button
      onClick={() => {
        if (hold.longFired.current) { hold.longFired.current = false; return }
        navigate(a.to)
      }}
      {...hold.bind}
      className="flex w-[60px] flex-col items-center gap-1.5 transition active:scale-95"
    >
      <span
        style={{ transform: hold.holding ? 'scale(0.9)' : hold.fired ? 'scale(1.12)' : undefined }}
        className={clsx(
          'relative flex h-14 w-14 items-center justify-center rounded-2xl shadow-card transition-transform',
          a.tile,
          hold.holding && 'ring-2 ring-white/80 dark:ring-white/60',
        )}
      >
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
}
