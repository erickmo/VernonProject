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
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:active:bg-slate-700/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                <Layers className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{g.group_name}</p>
                {g.description && (
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{g.description}</p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
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
