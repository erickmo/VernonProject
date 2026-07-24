import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Plus } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState, Button } from '@web/components/ui'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import { recruitmentApi } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/format'

const PILL = 'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold'
const STATUS_TONE: Record<string, string> = {
  Open: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Draft: 'bg-surface text-muted',
  Closed: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

export default function RecruitmentOpenings() {
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['recruitment', 'openings'], queryFn: () => recruitmentApi.listOpenings() })

  return (
    <Page>
      <PageHeader
        icon={Briefcase}
        title="Job Openings"
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate('/recruitment/openings/new')}>
            <Plus className="h-4 w-4" /> New opening
          </Button>
        }
      />

      {q.isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          rows={q.data ?? []}
          columns={[
            {
              key: 'title',
              header: 'Title',
              sortValue: (r) => r.title,
              render: (r) => <span className="font-medium text-ink">{r.title}</span>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <span className={`${PILL} ${STATUS_TONE[r.status] ?? 'bg-surface text-muted'}`}>{r.status}</span>,
            },
            {
              key: 'employment_type',
              header: 'Type',
              sortValue: (r) => r.employment_type,
              render: (r) => <span className="text-muted">{r.employment_type}</span>,
            },
            {
              key: 'location',
              header: 'Location',
              render: (r) => <span className="text-muted">{r.location || '—'}</span>,
            },
            {
              key: 'application_count',
              header: 'Applicants',
              align: 'right',
              sortValue: (r) => r.application_count,
              render: (r) => <span className="whitespace-nowrap text-muted tabular-nums">{formatNumber(r.application_count)}</span>,
            },
            {
              key: 'posted_on',
              header: 'Posted',
              sortValue: (r) => r.posted_on ?? '',
              render: (r) => <span className="whitespace-nowrap text-muted">{formatDate(r.posted_on)}</span>,
            },
          ]}
          getKey={(r) => r.name}
          onRowClick={(r) => navigate(`/recruitment/openings/${encodeURIComponent(r.name)}`)}
          empty={<EmptyState icon={Briefcase} title="No openings yet" subtitle="Click New opening to post a role." />}
        />
      )}
    </Page>
  )
}
