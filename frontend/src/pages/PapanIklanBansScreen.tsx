import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, ShieldCheck } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useBoot, canModerateAds, useAdBans, useUnbanUser } from '@/hooks/useData'

export default function PapanIklanBansScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: boot } = useBoot()
  const bans = useAdBans()
  const unban = useUnbanUser()

  const blocked = !!boot && !canModerateAds(boot)
  useEffect(() => { if (blocked) navigate('/', { replace: true }) }, [blocked, navigate])
  if (blocked) return null

  const items = bans.data ?? []

  const lift = async (user: string, userName: string) => {
    if (!(await confirm({ title: `Cabut ban ${userName}?`, confirmLabel: 'Cabut' }))) return
    unban.mutate(user, {
      onSuccess: () => toast('success', 'Ban dicabut'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <DetailScreen title="Papan Iklan — Ban">
      {bans.isLoading ? (
        <div className="py-16 text-center"><Spinner className="mx-auto h-5 w-5 text-slate-400" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Tidak ada ban aktif" />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((b) => (
            <div key={b.name} className="rounded-2xl border border-paper-edge bg-paper-card p-3 shadow-card dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-rose-500" />
                <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">{b.user_name}</p>
              </div>
              <p className="mt-1 text-xs text-stone-500">Sampai {b.banned_until} · {b.reason}</p>
              <p className="text-[11px] text-stone-400">oleh {b.banned_by}</p>
              <button onClick={() => lift(b.user, b.user_name)} disabled={unban.isPending}
                className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-brand-600 shadow-sm active:scale-95 disabled:opacity-60 dark:bg-slate-700">Cabut ban</button>
            </div>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}
