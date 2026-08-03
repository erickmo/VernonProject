import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { UserRoundCheck } from 'lucide-react'
import { useLastSeenReport, useBoot } from '@/hooks/useData'
import { presenceOf } from '@/lib/presence'

const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800'

export default function LastSeenScreen() {
  const { data, isFetching } = useLastSeenReport()
  const { data: boot } = useBoot()
  const win = boot?.settings?.online_window_minutes ?? 15
  const rows = data?.rows ?? []
  const onlineCount = rows.filter((r) => presenceOf(r.last_active, win).online).length

  return (
    <DetailScreen title="Last Seen">
      <div className="flex flex-col gap-4">
        {data && (
          <div className="grid grid-cols-2 gap-3">
            <div className={`${card} text-center`}>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{onlineCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Online now</p>
            </div>
            <div className={`${card} text-center`}>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{rows.length}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">People</p>
            </div>
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
                  <Avatar name={r.full_name || r.name} image={r.user_image} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-800 dark:text-slate-100">{r.full_name || r.name}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.member_type || r.name}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${p.online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{p.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DetailScreen>
  )
}
