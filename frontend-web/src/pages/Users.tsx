import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users as UsersIcon, Search } from 'lucide-react'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { Button, ErrorState } from '@web/components/ui'
import { useUsers, useBoot, canManageUsers, VERNON_ROLE_OPTIONS, MEMBER_TYPE_OPTIONS } from '@/hooks/useData'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { Column } from '@web/components/DataTable'

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  VERNON_ROLE_OPTIONS.map((o) => [o.value, o.label]),
)

const MEMBER_BADGE: Record<string, string> = {
  'Internal Team': 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  Intern: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
}

type StatusFilter = 'all' | 'active' | 'disabled'

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
]

// ponytail: semantic tokens for inactive chip — no hardcoded dark:bg-slate-*
const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? 'bg-brand-600 text-white'
      : 'bg-surface text-muted hover:bg-surface/80'
  }`

export default function Users() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const usersQuery = useUsers()
  const { data: users, isLoading } = usersQuery

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = useState('')
  const [memberFilter, setMemberFilter] = useState('')

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
      if (memberFilter && u.member_type !== memberFilter) return false
      return true
    })
  }, [users, search, status, roleFilter, memberFilter])

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

  const total = (users ?? []).length

  type UserRow = NonNullable<typeof users>[number]

  const cols: Column<UserRow>[] = [
    {
      key: 'user',
      header: 'User',
      sortValue: (u) => u.full_name || u.name,
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.full_name || u.name} image={u.user_image ?? undefined} config={u.avatar_config} size={32} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{u.full_name || u.name}</p>
            <p className="truncate text-xs text-muted">{u.name}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <span key={r} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              {ROLE_LABEL[r] ?? r}
            </span>
          ))}
          {u.roles.length === 0 && <span className="text-xs text-muted">—</span>}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (u) =>
        u.member_type ? (
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${MEMBER_BADGE[u.member_type] ?? 'bg-surface text-muted'}`}>
            {u.member_type}
          </span>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) =>
        u.enabled ? (
          <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            Active
          </span>
        ) : (
          <span className="inline-block rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
            Disabled
          </span>
        ),
    },
  ]

  return (
    <Page>
      <PageHeader
        icon={UsersIcon}
        title="Users"
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate('/users/new')}>
            <Plus className="h-3.5 w-3.5" /> New user
          </Button>
        }
      />

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="rose">
          <BentoStat value={total} label="users" />
        </BentoTile>

        <BentoTile span="sm" tone="tint" accent="brand">
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full rounded-xl border border-line bg-canvas py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUS_CHIPS.map((c) => (
                <button key={c.value} onClick={() => setStatus(c.value)} className={chip(status === c.value)}>
                  {c.label}
                </button>
              ))}
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
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setMemberFilter('')} className={chip(memberFilter === '')}>
                All types
              </button>
              {MEMBER_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMemberFilter(memberFilter === opt.value ? '' : opt.value)}
                  className={chip(memberFilter === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {total === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <EmptyState
                icon={UsersIcon}
                title="No users yet"
                subtitle="Invite your first teammate to get started."
              />
              <Button variant="primary" onClick={() => navigate('/users/new')}>
                <Plus className="h-4 w-4" /> New user
              </Button>
            </div>
          ) : (
            <DataTable
              rows={filtered}
              columns={cols}
              getKey={(u) => u.name}
              onRowClick={(u) => navigate(`/users/${encodeURIComponent(u.name)}`)}
              empty={
                <EmptyState
                  icon={UsersIcon}
                  title="No matching users"
                  subtitle="Try a different search or clear the filters."
                />
              }
            />
          )}
        </BentoTile>
      </BentoGrid>
    </Page>
  )
}
