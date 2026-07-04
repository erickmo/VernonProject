import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2 } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useRooms, useBoot, canManageResources } from '@/hooks/useData'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { DataTable } from '@web/components/DataTable'
import type { Column } from '@web/components/DataTable'

export default function MeetingRooms() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const roomsQuery = useRooms()
  const { data: rooms, isLoading } = roomsQuery

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

  if (roomsQuery.isError) {
    return <ErrorState onRetry={() => roomsQuery.refetch()} />
  }

  const list = rooms ?? []

  type RoomRow = NonNullable<typeof rooms>[number]

  const cols: Column<RoomRow>[] = [
    {
      key: 'room_name',
      header: 'Room Name',
      sortValue: (r) => r.room_name,
      render: (r) => <span className="font-medium text-ink">{r.room_name}</span>,
    },
    {
      key: 'location',
      header: 'Location',
      render: (r) => <span className="text-sm text-muted">{r.location || '—'}</span>,
    },
    {
      key: 'capacity',
      header: 'Capacity',
      sortValue: (r) => r.capacity ?? 0,
      render: (r) => <span className="text-sm text-ink">{r.capacity ?? '—'}</span>,
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
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Meeting Rooms</h1>

      <BentoGrid>
        <BentoTile
          span="sm"
          tone="tint"
          accent="slate"
          actions={
            <button
              onClick={() => navigate('/meeting-rooms/new')}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> New room
            </button>
          }
        >
          <BentoStat value={list.length} label="rooms" />
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <EmptyState
                icon={Building2}
                title="No meeting rooms yet"
                subtitle="Add a room to make it bookable."
              />
              <button
                onClick={() => navigate('/meeting-rooms/new')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <Plus className="h-4 w-4" /> New room
              </button>
            </div>
          ) : (
            <DataTable
              rows={list}
              columns={cols}
              getKey={(r) => r.name}
              onRowClick={(r) => navigate(`/meeting-rooms/${encodeURIComponent(r.name)}`)}
            />
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
