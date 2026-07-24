import { useNavigate } from 'react-router-dom'
import { useBoot } from '@/hooks/useData'
import { buildNavGroups } from '@web/lib/nav'
import type { NavLeaf } from '@web/lib/nav'
import { Sheet } from '@web/components/Sheet'

// The ~40 non-primary destinations, grouped, as a soft-pop grid. Opened from
// the "More" button in the tab bar (mirrors how /m buries these under Me/FAB).
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: b } = useBoot()
  const groups = buildNavGroups(b)
  const go = (to: string) => { onClose(); navigate(to) }

  const tile = (l: NavLeaf) => {
    const Icon = l.icon
    const cls = "flex items-center gap-3 rounded-2xl bg-canvas p-3 text-left shadow-card transition active:scale-[0.98] hover:bg-hover/[0.03]"
    const inner = (
      <>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{l.label}</span>
          {l.sub && <span className="block truncate text-xs text-muted">{l.sub}</span>}
        </span>
      </>
    )
    // Off-SPA/external destinations open in a new tab via a real anchor.
    return l.href ? (
      <a key={l.to} href={l.href} target="_blank" rel="noopener noreferrer" onClick={onClose} className={cls}>
        {inner}
      </a>
    ) : (
      <button key={l.to} onClick={() => go(l.to)} className={cls}>
        {inner}
      </button>
    )
  }
  const grid = (leaves: NavLeaf[]) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{leaves.map(tile)}</div>
  )

  return (
    <Sheet open={open} onClose={onClose} title="All destinations" size="lg">
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.id}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.label}</p>
            {g.sections ? (
              <div className="space-y-4">
                {g.sections.map((s) => (
                  <div key={s.title}>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted/70">{s.title}</p>
                    {grid(s.leaves)}
                  </div>
                ))}
              </div>
            ) : (
              grid(g.leaves)
            )}
          </div>
        ))}
      </div>
    </Sheet>
  )
}
