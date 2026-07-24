import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ACTION_GROUPS, GROUP_ACCENT, type ActionItem } from '@/lib/actions'
import { useHoldFeedback } from '@/hooks/useHoldFeedback'

// Sectioned Gojek-style home: each category is a tinted header + a horizontal
// row of gradient tiles. Surfacing the four groups (instead of one flat blob of
// 22 tiles) gives the grid rhythm and makes actions findable by intent.
// `badges` is keyed by route (`to`) — only a couple of tiles carry a count.
export function QuickActions({ badges }: { badges?: Record<string, string | number> }) {
  return (
    <div className="mt-4 space-y-4">
      {ACTION_GROUPS.map((g) => (
        <div key={g.title}>
          <h3 className={clsx('mb-2 flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wider', GROUP_ACCENT[g.hue])}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {g.title}
          </h3>
          <div className="no-scrollbar -mx-4 overflow-x-auto px-4 pt-1">
            <div className="flex gap-5">
              {g.items.map((a) => (
                <Tile key={a.title} action={a} tile={g.tile} badge={badges?.[a.to]} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Tap navigates; long-press (touch) plays a press-in + pop and swallows the
// trailing click, so a hold is pure tactile feedback — never an accidental nav.
function Tile({ action: a, tile, badge }: { action: ActionItem; tile: string; badge?: string | number }) {
  const navigate = useNavigate()
  const hold = useHoldFeedback()
  return (
    <button
      onClick={() => {
        if (hold.longFired.current) { hold.longFired.current = false; return }
        navigate(a.to)
      }}
      {...hold.bind}
      className="flex w-[60px] shrink-0 flex-col items-center gap-1.5 transition active:scale-95"
    >
      <span
        style={{ transform: hold.holding ? 'scale(0.9)' : hold.fired ? 'scale(1.12)' : undefined }}
        className={clsx(
          'relative flex h-14 w-14 items-center justify-center rounded-2xl transition-transform',
          tile,
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
