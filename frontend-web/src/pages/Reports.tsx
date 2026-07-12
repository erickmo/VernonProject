import { useNavigate } from 'react-router-dom'
import { BarChart3, AlarmClock } from 'lucide-react'
import { REPORTS } from '@/lib/reports'
import { Card, CardList } from '@web/components/Card'
import { Page, PageHeader } from '@web/components/Page'

function ReportBadge({ icon: Icon, accent }: { icon: React.ComponentType<{ className?: string }>; accent: string }) {
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br ${accent} text-white`}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}

export default function Reports() {
  const navigate = useNavigate()
  return (
    <Page>
      <PageHeader icon={BarChart3} title="Reports" subtitle={`${REPORTS.length} reports`} />

      <CardList>
        {/* Bespoke report: its own screen, not the generic /report/:name engine. */}
        <Card
          onClick={() => navigate('/reports/todos-due')}
          eyebrow={<ReportBadge icon={AlarmClock} accent="from-rose-500 to-pink-600" />}
          title="Todos Due"
          meta="Open todos to chase across projects you own, lead, or admin"
        />
        {REPORTS.map((r) => (
          <Card
            key={r.name}
            onClick={() => navigate(`/report/${encodeURIComponent(r.name)}`)}
            eyebrow={<ReportBadge icon={r.icon} accent={r.accent} />}
            title={r.title}
            meta={r.desc}
          />
        ))}
      </CardList>
    </Page>
  )
}
