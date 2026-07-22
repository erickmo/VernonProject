import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Boxes } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { Button, ErrorState } from '@web/components/ui'
import { useBusinessUnits, useBoot, canManageBusinessUnits } from '@/hooks/useData'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'

export default function BusinessUnits() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const unitsQuery = useBusinessUnits()
  const { data: units, isLoading } = unitsQuery

  const blocked = !!boot && !canManageBusinessUnits(boot)
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

  if (unitsQuery.isError) {
    return <ErrorState onRetry={() => unitsQuery.refetch()} />
  }

  const list = units ?? []

  return (
    <Page>
      <PageHeader
        icon={Boxes}
        title="Business Units"
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate('/business-units/new')}>
            <Plus className="h-3.5 w-3.5" /> New business unit
          </Button>
        }
      />

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="brand">
          <BentoStat value={list.length} label="business units" />
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <EmptyState
                icon={Boxes}
                title="No business units yet"
                subtitle="Add a business unit to organise your operations."
              />
              <Button variant="primary" onClick={() => navigate('/business-units/new')}>
                <Plus className="h-4 w-4" /> New business unit
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3">
              {list.map((u) => (
                <button
                  key={u.name}
                  type="button"
                  onClick={() => navigate(`/business-units/${encodeURIComponent(u.name)}`)}
                  className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-left font-medium text-ink hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-hover/[0.03] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition"
                >
                  {u.image ? (
                    <img src={u.image} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <Boxes className="h-4 w-4 shrink-0 text-muted" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{u.business_unit_name}</span>
                    {u.company && <span className="block truncate text-xs text-muted">{u.company}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </Page>
  )
}
