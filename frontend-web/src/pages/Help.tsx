import { useNavigate } from 'react-router-dom'
import { Card, CardList } from '@web/components/Card'
import { ACTION_GROUPS, MOBILE_ONLY } from '@/lib/actions'

// Onboarding "what can I do" list, rendered from the shared mobile source of
// truth (@/lib/actions) so it can't drift. Routes that only exist on mobile
// are filtered out (via the shared MOBILE_ONLY set) so no card leads to a 404.

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
          <CardList>
            {g.items.map((it) => (
              <Card
                key={it.title}
                onClick={() => nav(it.to)}
                title={
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
                      <it.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{it.title}</p>
                      <p className="mt-0.5 text-xs font-normal text-muted">{it.desc}</p>
                    </div>
                  </div>
                }
              />
            ))}
          </CardList>
        </div>
      ))}
    </div>
  )
}
