import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trophy } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useScoringGroups, useBoot, canManageGroups } from '@/hooks/useData'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'

export default function Groups() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const groupsQuery = useScoringGroups()
  const { data: groups, isLoading } = groupsQuery

  const blocked = !!boot && !canManageGroups(boot)
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

  if (groupsQuery.isError) {
    return <ErrorState onRetry={() => groupsQuery.refetch()} />
  }

  const list = groups ?? []

  return (
    <Page>
      <PageHeader
        icon={Trophy}
        title="Groups"
        actions={
          <button
            onClick={() => navigate('/groups/new')}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New group
          </button>
        }
      />

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="brand">
          <BentoStat value={list.length} label="groups" />
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <EmptyState
                icon={Trophy}
                title="No groups yet"
                subtitle="Create a scoring group to start weighting tasks."
              />
              <button
                onClick={() => navigate('/groups/new')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <Plus className="h-4 w-4" /> New group
              </button>
            </div>
          ) : (
            <DataTable
              rows={list}
              columns={[
                {
                  key: 'name',
                  header: 'Group',
                  sortValue: (g) => g.group_name,
                  render: (g) => <span className="font-medium text-ink">{g.group_name}</span>,
                },
                {
                  key: 'description',
                  header: 'Description',
                  render: (g) => (
                    <span className="max-w-md truncate text-muted">{g.description || '—'}</span>
                  ),
                },
              ]}
              getKey={(g) => g.name}
              onRowClick={(g) => navigate(`/groups/${encodeURIComponent(g.name)}`)}
            />
          )}
        </BentoTile>
      </BentoGrid>
    </Page>
  )
}
