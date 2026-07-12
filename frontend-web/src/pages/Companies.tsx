import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2 } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { Button, ErrorState } from '@web/components/ui'
import { useCompanies, useBoot, canManageCompanies } from '@/hooks/useData'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'

export default function Companies() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const companiesQuery = useCompanies()
  const { data: companies, isLoading } = companiesQuery

  const blocked = !!boot && !canManageCompanies(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (bootLoading || isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (blocked) return null

  if (companiesQuery.isError) {
    return <ErrorState onRetry={() => companiesQuery.refetch()} />
  }

  const list = companies ?? []

  return (
    <Page>
      <PageHeader
        icon={Building2}
        title="Companies"
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate('/companies/new')}>
            <Plus className="h-3.5 w-3.5" /> New company
          </Button>
        }
      />

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="brand">
          <BentoStat value={list.length} label="companies" />
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <EmptyState
                icon={Building2}
                title="No companies yet"
                subtitle="Add a company to group your brands and projects."
              />
              <Button variant="primary" onClick={() => navigate('/companies/new')}>
                <Plus className="h-4 w-4" /> New company
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3">
              {list.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => navigate(`/companies/${encodeURIComponent(c.name)}`)}
                  className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-left font-medium text-ink hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-hover/[0.03] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate">{c.company_name}</span>
                </button>
              ))}
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </Page>
  )
}
