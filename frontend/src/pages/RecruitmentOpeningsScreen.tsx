import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Briefcase, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, canManageRecruitment } from '@/hooks/useData'
import { recruitmentApi } from '@/lib/api'

const STATUS_HUE: Record<string, string> = {
  Open: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Draft: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  Closed: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
}

export default function RecruitmentOpeningsScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageRecruitment(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const { data: openings, isLoading } = useQuery({
    queryKey: ['recruitmentOpenings'],
    queryFn: () => recruitmentApi.listOpenings(),
    enabled: canManageRecruitment(boot),
  })

  if (blocked) return null

  return (
    <DetailScreen
      title="Lowongan"
      right={
        <button
          onClick={() => navigate('/recruitment/openings/new')}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Plus className="h-4 w-4" /> Lowongan baru
        </button>
      }
    >
      {isLoading ? (
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      ) : !(openings ?? []).length ? (
        <EmptyState icon={Briefcase} title="Belum ada lowongan" subtitle="Ketuk Lowongan baru untuk membuat." />
      ) : (
        <div className="flex flex-col gap-2">
          {(openings ?? []).map((o) => (
            <button
              key={o.name}
              onClick={() => navigate(`/recruitment/openings/${encodeURIComponent(o.name)}`)}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:active:bg-slate-700/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <Briefcase className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{o.title}</p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {o.employment_type}
                  {o.location ? ` · ${o.location}` : ''} · {o.application_count} lamaran
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_HUE[o.status] ?? STATUS_HUE.Draft}`}
                >
                  {o.status}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
              </div>
            </button>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}
