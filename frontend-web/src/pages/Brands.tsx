import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Store } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState, rowButtonProps } from '@web/components/ui'
import { useBrands, useBoot, canManageBrands } from '@/hooks/useData'

export default function Brands() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const brandsQuery = useBrands()
  const { data: brands, isLoading } = brandsQuery

  const blocked = !!boot && !canManageBrands(boot)
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

  if (brandsQuery.isError) {
    return <ErrorState onRetry={() => brandsQuery.refetch()} />
  }

  const list = brands ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Brands</h1>
        <button
          onClick={() => navigate('/brands/new')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> New brand
        </button>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-3">
          <EmptyState
            icon={Store}
            title="No brands yet"
            subtitle="Add a brand to tag and group your projects."
          />
          <button
            onClick={() => navigate('/brands/new')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> New brand
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3">
          {list.map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => navigate(`/brands/${encodeURIComponent(b.name)}`)}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-left font-medium text-slate-800 dark:text-slate-100 hover:border-brand-300 dark:hover:border-brand-500/40 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition"
            >
              <Store className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{b.brand_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
