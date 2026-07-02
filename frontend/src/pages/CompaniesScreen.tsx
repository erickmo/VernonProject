import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useCompanies, useBoot, canManageCompanies } from '@/hooks/useData'

export default function CompaniesScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const { data: companies, isLoading } = useCompanies()

  if (bootLoading) {
    return (
      <DetailScreen title="Companies" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  if (!canManageCompanies(boot)) return <NoAccessRedirect />

  return (
    <DetailScreen
      title="Companies"
      right={
        <button
          onClick={() => navigate('/companies/new')}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Plus className="h-4 w-4" /> Company
        </button>
      }
    >
      {isLoading ? (
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      ) : !(companies ?? []).length ? (
        <EmptyState icon={Building2} title="No companies yet" />
      ) : (
        <div className="flex flex-col gap-2">
          {(companies ?? []).map((c) => (
            <button
              key={c.name}
              onClick={() => navigate(`/companies/${encodeURIComponent(c.name)}`)}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:active:bg-slate-700/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{c.company_name}</p>
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
