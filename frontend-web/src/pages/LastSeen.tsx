import { UserRoundCheck } from 'lucide-react'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable, type Column } from '@web/components/DataTable'
import { EmptyState, PresenceAvatar } from '@/components/ui'
import { useLastSeenReport, useBoot } from '@/hooks/useData'
import { presenceOf } from '@/lib/presence'
import type { LastSeenRow } from '@/lib/types'

export default function LastSeen() {
  const { data, isFetching } = useLastSeenReport()
  const { data: boot } = useBoot()
  const win = boot?.settings?.online_window_minutes ?? 15
  const rows = data?.rows ?? []
  const active = rows.filter((u) => presenceOf(u.last_active, win).online)

  const cols: Column<LastSeenRow>[] = [
    {
      key: 'user',
      header: 'User',
      sortValue: (u) => u.full_name || u.name,
      render: (u) => (
        <div className="flex items-center gap-3">
          <PresenceAvatar name={u.full_name || u.name} image={u.user_image} config={u.avatar_config} size={32} rounded online={presenceOf(u.last_active, win).online} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{u.full_name || u.name}</p>
            <p className="truncate text-xs text-muted">{u.name}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (u) => (u.member_type ? <span className="text-xs text-muted">{u.member_type}</span> : <span className="text-xs text-muted">—</span>),
    },
    {
      key: 'presence',
      header: 'Last seen',
      // Stalest-first: never-seen (0) sorts before any timestamp; larger = more recent.
      sortValue: (u) => (u.last_active ? new Date(u.last_active.replace(' ', 'T')).getTime() : 0),
      render: (u) => {
        const p = presenceOf(u.last_active, win)
        return (
          <div className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${p.online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
            <span className="text-sm text-ink">{p.label}</span>
          </div>
        )
      },
    },
  ]

  return (
    <Page>
      <PageHeader icon={UserRoundCheck} title="Last Seen" subtitle="When each teammate was last active" />
      {data && (
        <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Online now · {active.length}</p>
          {active.length === 0 ? (
            <p className="text-sm text-muted">Nobody online right now.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {active.map((u) => (
                <div key={u.name} className="flex w-16 flex-col items-center gap-1" title={u.full_name || u.name}>
                  <PresenceAvatar name={u.full_name || u.name} image={u.user_image} config={u.avatar_config} size={44} rounded online />
                  <span className="w-full truncate text-center text-[11px] text-muted">{(u.full_name || u.name).split(' ')[0]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {isFetching && !data ? null : rows.length === 0 ? (
        <EmptyState icon={UserRoundCheck} title="No people to show" />
      ) : (
        <DataTable rows={rows} columns={cols} getKey={(r) => r.name} />
      )}
    </Page>
  )
}
