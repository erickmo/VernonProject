import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Boxes, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useBusinessUnits, useBoot, canManageBusinessUnits } from '@/hooks/useData'

export default function BusinessUnitsScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const { data: units, isLoading } = useBusinessUnits()

  if (bootLoading) {
    return (
      <DetailScreen title="Business Units" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  if (!canManageBusinessUnits(boot)) return <NoAccessRedirect />

  return (
    <DetailScreen
      title="Business Units"
      right={
        <button
          onClick={() => navigate('/business-units/new')}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Plus className="h-4 w-4" /> Unit
        </button>
      }
    >
      {isLoading ? (
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      ) : !(units ?? []).length ? (
        <EmptyState icon={Boxes} title="No business units yet" />
      ) : (
        <div className="flex flex-col gap-2">
          {(units ?? []).map((u) => (
            <button
              key={u.name}
              onClick={() => navigate(`/business-units/${encodeURIComponent(u.name)}`)}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:active:bg-slate-700/50"
            >
              {u.image ? (
                <img src={u.image} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                  <Boxes className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{u.business_unit_name}</p>
                {u.company && (
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.company}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
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
