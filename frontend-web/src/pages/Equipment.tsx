import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Package } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useEquipment, useBoot, canManageResources } from '@/hooks/useData'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { DataTable } from '@web/components/DataTable'
import type { Column } from '@web/components/DataTable'

export default function Equipment() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const equipmentQuery = useEquipment()
  const { data: equipment, isLoading } = equipmentQuery

  const blocked = !!boot && !canManageResources(boot)
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

  if (equipmentQuery.isError) {
    return <ErrorState onRetry={() => equipmentQuery.refetch()} />
  }

  const list = equipment ?? []

  type EquipmentRow = NonNullable<typeof equipment>[number]

  const cols: Column<EquipmentRow>[] = [
    {
      key: 'equipment_name',
      header: 'Equipment Name',
      sortValue: (r) => r.equipment_name,
      render: (r) => <span className="font-medium text-ink">{r.equipment_name}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (r) => <span className="text-sm text-muted">{r.category || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.is_active ? (
          <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            Active
          </span>
        ) : (
          <span className="inline-block rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
            Inactive
          </span>
        ),
    },
  ]

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Resources</h1>

      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/meeting-rooms')}
          className="rounded-full px-3 py-1.5 text-sm font-medium bg-hover/[0.05] text-muted hover:bg-hover/[0.1]"
        >
          Rooms
        </button>
        <button className="rounded-full px-3 py-1.5 text-sm font-medium bg-brand-600 text-white">Equipment</button>
      </div>

      <BentoGrid>
        <BentoTile
          span="sm"
          tone="tint"
          accent="brand"
          actions={
            <button
              onClick={() => navigate('/equipment/new')}
              className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 active:scale-[0.97] transition"
            >
              <Plus className="h-3.5 w-3.5" /> New equipment
            </button>
          }
        >
          <BentoStat value={list.length} label="equipment" />
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <EmptyState
                icon={Package}
                title="No equipment yet"
                subtitle="Add equipment to make it bookable."
              />
              <button
                onClick={() => navigate('/equipment/new')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.97] transition"
              >
                <Plus className="h-4 w-4" /> New equipment
              </button>
            </div>
          ) : (
            <DataTable
              rows={list}
              columns={cols}
              getKey={(r) => r.name}
              onRowClick={(r) => navigate(`/equipment/${encodeURIComponent(r.name)}`)}
            />
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
