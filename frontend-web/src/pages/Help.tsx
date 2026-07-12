import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { ACTION_GROUPS } from '@/lib/actions'

// Onboarding "what can I do" list, rendered from the shared mobile source of
// truth (@/lib/actions) so it can't drift. Routes that only exist on mobile
// (QR check-in, extra income) are filtered out so no card leads to a 404.
const MOBILE_ONLY = new Set(['/scan', '/income'])

export default function Help() {
  const nav = useNavigate()
  const groups = ACTION_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => !MOBILE_ONLY.has(it.to.split('?')[0])) }))
    .filter((g) => g.items.length > 0)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">What can I do</h1>
        <p className="mt-1 text-sm text-muted">
          New to Vernon? Here's everything you can do — click any card to jump in.
        </p>
      </div>

      {groups.map((g) => (
        <div key={g.title}>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted/70">{g.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.items.map((it) => (
              <button
                key={it.title}
                onClick={() => nav(it.to)}
                className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:bg-hover/[0.04]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                  <it.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{it.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{it.desc}</p>
                </div>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
