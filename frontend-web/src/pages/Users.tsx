import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users as UsersIcon, Search } from 'lucide-react'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { ErrorState, rowButtonProps } from '@web/components/ui'
import { useUsers, useBoot, canManageUsers, VERNON_ROLE_OPTIONS } from '@/hooks/useData'

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  VERNON_ROLE_OPTIONS.map((o) => [o.value, o.label]),
)

type StatusFilter = 'all' | 'active' | 'disabled'

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
]

const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? 'bg-brand-600 text-white'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
  }`

export default function Users() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const usersQuery = useUsers()
  const { data: users, isLoading } = usersQuery

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = useState('')

  const blocked = !!boot && !canManageUsers(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (users ?? []).filter((u) => {
      if (q && !(u.full_name ?? '').toLowerCase().includes(q) && !u.name.toLowerCase().includes(q))
        return false
      if (status === 'active' && u.enabled !== 1) return false
      if (status === 'disabled' && u.enabled !== 0) return false
      if (roleFilter && !u.roles.includes(roleFilter)) return false
      return true
    })
  }, [users, search, status, roleFilter])

  if (bootLoading || isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (blocked) return null

  if (usersQuery.isError) {
    return <ErrorState onRetry={() => usersQuery.refetch()} />
  }

  const hasUsers = (users ?? []).length > 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <button
          onClick={() => navigate('/users/new')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> New user
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>
        <div className="flex gap-2">
          {STATUS_CHIPS.map((c) => (
            <button key={c.value} onClick={() => setStatus(c.value)} className={chip(status === c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setRoleFilter('')} className={chip(roleFilter === '')}>
          All roles
        </button>
        {VERNON_ROLE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRoleFilter(roleFilter === opt.value ? '' : opt.value)}
            className={chip(roleFilter === opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {!hasUsers ? (
        <div className="flex flex-col items-center gap-3">
          <EmptyState
            icon={UsersIcon}
            title="No users yet"
            subtitle="Invite your first teammate to get started."
          />
          <button
            onClick={() => navigate('/users/new')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> New user
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No matching users"
          subtitle="Try a different search or clear the filters."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Roles</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((u) => (
                <tr
                  key={u.name}
                  {...rowButtonProps(() => navigate(`/users/${encodeURIComponent(u.name)}`))}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.full_name || u.name} image={u.user_image ?? undefined} size={32} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                          {u.full_name || u.name}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span
                          key={r}
                          className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                        >
                          {ROLE_LABEL[r] ?? r}
                        </span>
                      ))}
                      {u.roles.length === 0 && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {u.enabled ? (
                      <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        Active
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                        Disabled
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
