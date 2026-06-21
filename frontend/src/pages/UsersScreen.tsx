import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { useUsers, useBoot, canManageUsers, VERNON_ROLE_OPTIONS } from '@/hooks/useData'

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  VERNON_ROLE_OPTIONS.map((o) => [o.value, o.label]),
)

export default function UsersScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const { data: users, isLoading } = useUsers()

  if (bootLoading) {
    return (
      <DetailScreen title="Users" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  if (!canManageUsers(boot)) return <NoAccessRedirect />

  return (
    <DetailScreen
      title="Users"
      right={
        <button
          onClick={() => navigate('/users/new')}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Plus className="h-4 w-4" /> User
        </button>
      }
    >
      {isLoading ? (
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      ) : !(users ?? []).length ? (
        <EmptyState icon={Users} title="No users yet" />
      ) : (
        <div className="flex flex-col gap-2">
          {(users ?? []).map((u) => (
            <button
              key={u.name}
              onClick={() => navigate(`/users/${encodeURIComponent(u.name)}`)}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-card active:bg-slate-50"
            >
              <Avatar name={u.full_name || u.name} image={u.user_image} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {u.full_name || u.name}
                </p>
                <p className="truncate text-xs text-slate-500">{u.name}</p>
                {u.roles.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700"
                      >
                        {ROLE_LABEL[r] ?? r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {!u.enabled && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  Disabled
                </span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
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
