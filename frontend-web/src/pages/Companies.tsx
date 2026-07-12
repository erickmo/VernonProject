import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2 } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useCompanies, useBoot, canManageCompanies } from '@/hooks/useData'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

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
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Companies</h1>

      <BentoGrid>
        <BentoTile
          span="sm"
          tone="tint"
          accent="brand"
          actions={
            <button
              onClick={() => navigate('/companies/new')}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> New company
            </button>
          }
        >
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
              <button
                onClick={() => navigate('/companies/new')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <Plus className="h-4 w-4" /> New company
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3">
              {list.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => navigate(`/companies/${encodeURIComponent(c.name)}`)}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-left font-medium text-ink hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-hover/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate">{c.company_name}</span>
                </button>
              ))}
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
