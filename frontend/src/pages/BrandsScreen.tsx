import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Store, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useBrands, useBoot, canManageBrands } from '@/hooks/useData'

export default function BrandsScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const { data: brands, isLoading } = useBrands()

  if (bootLoading) {
    return (
      <DetailScreen title="Brands" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  if (!canManageBrands(boot)) return <NoAccessRedirect />

  return (
    <DetailScreen
      title="Brands"
      right={
        <button
          onClick={() => navigate('/brands/new')}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Plus className="h-4 w-4" /> Brand
        </button>
      }
    >
      {isLoading ? (
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      ) : !(brands ?? []).length ? (
        <EmptyState icon={Store} title="No brands yet" />
      ) : (
        <div className="flex flex-col gap-2">
          {(brands ?? []).map((b) => (
            <button
              key={b.name}
              onClick={() => navigate(`/brands/${encodeURIComponent(b.name)}`)}
              className="flex items-center justify-between rounded-2xl bg-white p-4 text-left shadow-card active:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{b.brand_name}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </div>
            </button>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}

function NoAccessRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/', { replace: true })
  }, [navigate])
  return null
}
