import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, ChevronRight, Search } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { useUsers, useBoot, canManageUsers, VERNON_ROLE_OPTIONS } from '@/hooks/useData'
import type { ManagedUser } from '@/lib/types'

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  VERNON_ROLE_OPTIONS.map((o) => [o.value, o.label]),
)

type StatusFilter = 'all' | 'active' | 'disabled'

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
]

export default function UsersScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const { data: users, isLoading } = useUsers()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = useState<string>('')

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
      ) : (
        <UsersBody
          users={users ?? []}
          search={search}
          setSearch={setSearch}
          status={status}
          setStatus={setStatus}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          onSelect={(name) => navigate(`/users/${encodeURIComponent(name)}`)}
        />
      )}
    </DetailScreen>
  )
}

interface UsersBodyProps {
  users: ManagedUser[]
  search: string
  setSearch: (v: string) => void
  status: StatusFilter
  setStatus: (v: StatusFilter) => void
  roleFilter: string
  setRoleFilter: (v: string) => void
  onSelect: (name: string) => void
}

function UsersBody({
  users,
  search,
  setSearch,
  status,
  setStatus,
  roleFilter,
  setRoleFilter,
  onSelect,
}: UsersBodyProps) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (q && !(u.full_name ?? '').toLowerCase().includes(q) && !u.name.toLowerCase().includes(q))
        return false
      if (status === 'active' && u.enabled !== 1) return false
      if (status === 'disabled' && u.enabled !== 0) return false
      if (roleFilter && !u.roles.includes(roleFilter)) return false
      return true
    })
  }, [users, search, status, roleFilter])

  const hasUsers = users.length > 0

  return (
    <div className="flex flex-col gap-4">
      {/* Search input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
        />
      </div>

      {/* Status chips */}
      <div className="flex gap-2">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setStatus(chip.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              status === chip.value
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:active:bg-slate-700'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Role chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setRoleFilter('')}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            roleFilter === ''
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 text-slate-600 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:active:bg-slate-700'
          }`}
        >
          All roles
        </button>
        {VERNON_ROLE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRoleFilter(roleFilter === opt.value ? '' : opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              roleFilter === opt.value
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:active:bg-slate-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List or empty states */}
      {!hasUsers ? (
        <EmptyState icon={Users} title="No users yet" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No matching users" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((u) => (
            <button
              key={u.name}
              onClick={() => onSelect(u.name)}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-card active:bg-slate-50 dark:bg-slate-800 dark:active:bg-slate-700/50"
            >
              <Avatar name={u.full_name || u.name} image={u.user_image} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {u.full_name || u.name}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.name}</p>
                {u.roles.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                      >
                        {ROLE_LABEL[r] ?? r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {!u.enabled && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  Disabled
                </span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NoAccessRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/', { replace: true })
  }, [navigate])
  return null
}
