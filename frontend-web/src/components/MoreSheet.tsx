import { useNavigate } from 'react-router-dom'
import { useBoot } from '@/hooks/useData'
import { buildNavGroups } from '@web/lib/nav'
import { Sheet } from '@web/components/Sheet'

// The ~40 non-primary destinations, grouped, as a soft-pop grid. Opened from
// the "More" button in the tab bar (mirrors how /m buries these under Me/FAB).
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: b } = useBoot()
  const groups = buildNavGroups(b)
  const go = (to: string) => { onClose(); navigate(to) }

  return (
    <Sheet open={open} onClose={onClose} title="All destinations" size="lg">
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.id}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.label}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {g.leaves.map((l) => {
                const Icon = l.icon
                return (
                  <button key={l.to} onClick={() => go(l.to)}
                    className="flex items-center gap-3 rounded-2xl bg-canvas p-3 text-left shadow-card transition active:scale-[0.98] hover:bg-hover/[0.03]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{l.label}</span>
                      {l.sub && <span className="block truncate text-xs text-muted">{l.sub}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
