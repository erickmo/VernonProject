import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trophy, ChevronRight, Layers, GitMerge } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useScoringGroups, useBoot, canManageGroups, useMergeScoringGroup } from '@/hooks/useData'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'

export default function GroupsScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const { data: groups, isLoading } = useScoringGroups()
  const [mergeMode, setMergeMode] = useState(false)
  const [src, setSrc] = useState('')
  const [tgt, setTgt] = useState('')
  const merge = useMergeScoringGroup()
  const toast = useToast()

  if (bootLoading) {
    return (
      <DetailScreen title="Groups" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  if (!canManageGroups(boot)) return <NoAccessRedirect />

  const groupOptions = (groups ?? []).map((g) => ({ value: g.name, label: g.group_name }))

  const doMerge = () => {
    if (!src || !tgt) { toast('error', 'Pick source and target'); return }
    if (src === tgt) { toast('error', 'Source and target must differ'); return }
    if (!confirm(`Merge "${src}" into "${tgt}"? Todos move to "${tgt}" and "${src}" is deleted.`)) return
    merge.mutate({ source: src, target: tgt }, {
      onSuccess: () => { toast('success', 'Groups merged'); setMergeMode(false); setSrc(''); setTgt('') },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <DetailScreen
      title="Groups"
      right={
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setMergeMode((m) => !m); setSrc(''); setTgt('') }}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold active:scale-95 ${mergeMode ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}
          >
            <GitMerge className="h-4 w-4" /> Merge
          </button>
          <button
            onClick={() => navigate('/groups/new')}
            className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
          >
            <Plus className="h-4 w-4" /> Group
          </button>
        </div>
      }
    >
      {mergeMode && (
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-card">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Merge Groups</p>
          <div className="mb-2">
            <label className="mb-1 block text-xs text-slate-500">Source (will be deleted)</label>
            <SearchableSelect
              value={src}
              onChange={setSrc}
              options={groupOptions}
              placeholder="Select source group…"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs text-slate-500">Target (keeps all data)</label>
            <SearchableSelect
              value={tgt}
              onChange={setTgt}
              options={groupOptions}
              placeholder="Select target group…"
            />
          </div>
          <button
            onClick={doMerge}
            disabled={merge.isPending}
            className="w-full rounded-xl bg-red-600 py-2 text-sm font-semibold text-white active:bg-red-700 disabled:opacity-50"
          >
            {merge.isPending ? 'Merging…' : 'Merge'}
          </button>
        </div>
      )}
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
