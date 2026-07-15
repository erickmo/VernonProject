import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, AlarmClock, Search, X, SearchX } from 'lucide-react'
import { REPORTS } from '@/lib/reports'
import { Card, CardList } from '@web/components/Card'
import { EmptyState } from '@/components/ui'
import { Page, PageHeader, rise } from '@web/components/Page'

const TODOS_DUE = {
  title: 'Todos Due',
  desc: 'Open todos to chase across projects you own, lead, or admin',
}

function ReportBadge({ icon: Icon, accent }: { icon: React.ComponentType<{ className?: string }>; accent: string }) {
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br ${accent} text-white`}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}

export default function Reports() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const query = q.trim().toLowerCase()
  const match = (title: string, desc: string) =>
    !query || title.toLowerCase().includes(query) || desc.toLowerCase().includes(query)

  const showTodosDue = match(TODOS_DUE.title, TODOS_DUE.desc)
  const filtered = useMemo(() => REPORTS.filter((r) => match(r.title, r.desc)), [query])
  const count = filtered.length + (showTodosDue ? 1 : 0)

  return (
    <Page>
      <PageHeader icon={BarChart3} title="Reports" subtitle={`${count} of ${REPORTS.length + 1} reports`} />

      {/* Search — filters the catalogue by title or description. */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search reports…"
          aria-label="Search reports"
          className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-9 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {count === 0 ? (
        <EmptyState icon={SearchX} title="No matching reports" subtitle={`Nothing matches “${q}”.`} />
      ) : (
        <CardList>
          {/* Bespoke report: its own screen, not the generic /report/:name engine. */}
          {showTodosDue && (
            <div {...rise(0)}>
              <Card
                onClick={() => navigate('/reports/todos-due')}
                eyebrow={<ReportBadge icon={AlarmClock} accent="from-rose-500 to-pink-600" />}
                title={TODOS_DUE.title}
                meta={TODOS_DUE.desc}
              />
            </div>
          )}
          {filtered.map((r, i) => (
            <div key={r.name} {...rise(i + 1)}>
              <Card
                onClick={() => navigate(`/report/${encodeURIComponent(r.name)}`)}
                eyebrow={<ReportBadge icon={r.icon} accent={r.accent} />}
                title={r.title}
                meta={r.desc}
              />
            </div>
          ))}
        </CardList>
      )}
    </Page>
  )
}
