import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trophy, ChevronRight, Layers } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useScoringGroups, useBoot, canManageGroups } from '@/hooks/useData'

export default function GroupsScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const { data: groups, isLoading } = useScoringGroups()

  if (bootLoading) {
    return (
      <DetailScreen title="Groups" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  if (!canManageGroups(boot)) return <NoAccessRedirect />

  return (
    <DetailScreen
      title="Groups"
      right={
        <button
          onClick={() => navigate('/groups/new')}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Plus className="h-4 w-4" /> Group
        </button>
      }
    >
      {isLoading ? (
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      ) : !(groups ?? []).length ? (
        <EmptyState icon={Trophy} title="No groups yet" />
      ) : (
        <div className="flex flex-col gap-2">
          {(groups ?? []).map((g) => (
            <button
              key={g.name}
              onClick={() => navigate(`/groups/${encodeURIComponent(g.name)}`)}
              className="flex items-center justify-between rounded-2xl bg-white p-4 text-left shadow-card active:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{g.group_name}</p>
                {g.description && (
                  <p className="truncate text-xs text-slate-500">{g.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                  <Layers className="h-3 w-3" /> {g.weight}%
                </span>
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
