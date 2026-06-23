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
        <div className="max-w-3xl rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Brand</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((b) => (
                <tr
                  key={b.name}
                  {...rowButtonProps(() => navigate(`/brands/${encodeURIComponent(b.name)}`))}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
                >
                  <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                    {b.brand_name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
