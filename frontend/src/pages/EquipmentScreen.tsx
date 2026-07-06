import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Projector, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { useEquipment, useBoot, canManageResources } from '@/hooks/useData'

export default function EquipmentScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const { data: equipment, isLoading } = useEquipment()

  if (bootLoading) {
    return (
      <DetailScreen title="Resources" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  if (!canManageResources(boot)) return <NoAccessRedirect />

  return (
    <DetailScreen
      title="Resources"
      right={
        <button
          onClick={() => navigate('/equipment/new')}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Plus className="h-4 w-4" /> Equipment
        </button>
      }
    >
      <div className="mb-4">
        <Segmented
          options={[{ value: 'rooms', label: 'Rooms' }, { value: 'equipment', label: 'Equipment' }]}
          value="equipment"
          onChange={(v) => { if (v === 'rooms') navigate('/meeting-rooms') }}
        />
      </div>
      {isLoading ? (
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      ) : !(equipment ?? []).length ? (
        <EmptyState icon={Projector} title="No equipment yet" />
      ) : (
        <div className="flex flex-col gap-2">
          {(equipment ?? []).map((e) => (
            <button
              key={e.name}
              onClick={() => navigate(`/equipment/${encodeURIComponent(e.name)}`)}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:active:bg-slate-700/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                <Projector className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{e.equipment_name}</p>
                {e.category && (
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{e.category}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!e.is_active && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                    Inactive
                  </span>
                )}
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
