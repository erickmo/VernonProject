import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, PresenceAvatar } from '@/components/ui'
import { UserRoundCheck } from 'lucide-react'
import { useLastSeenReport, useBoot } from '@/hooks/useData'
import { presenceOf } from '@/lib/presence'

const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800'

export default function LastSeenScreen() {
  const { data, isFetching } = useLastSeenReport()
  const { data: boot } = useBoot()
  const win = boot?.settings?.online_window_minutes ?? 15
  const rows = data?.rows ?? []
  const active = rows.filter((r) => presenceOf(r.last_active, win).online)

  return (
    <DetailScreen title="Last Seen">
      <div className="flex flex-col gap-4">
        {/* Everyone active right now, as avatars. */}
        {data && (
          <div className={`${card} flex flex-col gap-2.5`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Online now · {active.length}
            </p>
            {active.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Nobody online right now.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {active.map((r) => (
                  <div key={r.name} className="flex w-14 flex-col items-center gap-1">
                    <PresenceAvatar name={r.full_name || r.name} image={r.user_image} config={r.avatar_config} size={44} online />
                    <span className="w-full truncate text-center text-[10px] text-slate-500 dark:text-slate-400">
                      {(r.full_name || r.name).split(' ')[0]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isFetching && !data ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={UserRoundCheck} title="No people to show" />
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => {
              const p = presenceOf(r.last_active, win)
              return (
                <div key={r.name} className={`${card} flex items-center gap-3`}>
                  <PresenceAvatar name={r.full_name || r.name} image={r.user_image} config={r.avatar_config} size={40} online={p.online} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-800 dark:text-slate-100">{r.full_name || r.name}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.member_type || r.name}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{p.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DetailScreen>
  )
}
