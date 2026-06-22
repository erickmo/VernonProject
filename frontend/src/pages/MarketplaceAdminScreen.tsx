import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Store, ChevronRight, Check, Gift } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { useToast } from '@/components/Toast'
import {
  useBoot,
  canManageMarketplace,
  useRewardsAdmin,
  useRedemptionsAdmin,
  useFulfillRedemption,
} from '@/hooks/useData'

type Tab = 'rewards' | 'redemptions'
type RStatus = 'pending' | 'fulfilled' | 'all'

export default function MarketplaceAdminScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const [tab, setTab] = useState<Tab>('rewards')

  const blocked = !boot ? false : !canManageMarketplace(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (bootLoading) {
    return (
      <DetailScreen title="Marketplace admin">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }
  if (blocked) return null

  return (
    <DetailScreen
      title="Marketplace admin"
      right={
        tab === 'rewards' ? (
          <button
            onClick={() => navigate('/marketplace-admin/reward/new')}
            className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
          >
            <Plus className="h-4 w-4" /> Reward
          </button>
        ) : null
      }
    >
      <Segmented
        options={[
          { value: 'rewards', label: 'Rewards' },
          { value: 'redemptions', label: 'Redemptions' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-4">{tab === 'rewards' ? <RewardsList /> : <RedemptionsList />}</div>
    </DetailScreen>
  )
}

function RewardsList() {
  const navigate = useNavigate()
  const { data: rewards, isLoading } = useRewardsAdmin()
  if (isLoading) return <Spinner className="mx-auto h-5 w-5 text-slate-400" />
  if (!(rewards ?? []).length)
    return <EmptyState icon={Store} title="No rewards yet" subtitle="Tap + Reward to add one." />
  return (
    <div className="flex flex-col gap-2">
      {(rewards ?? []).map((r) => (
        <button
          key={r.name}
          onClick={() => navigate(`/marketplace-admin/reward/${encodeURIComponent(r.name)}`)}
          className="flex items-center justify-between rounded-2xl bg-white p-4 text-left shadow-card active:bg-slate-50 dark:bg-slate-800 dark:active:bg-slate-700/50"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{r.reward_name}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {r.point_cost} pts · stock {r.stock_quantity}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                r.active
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
              }`}
            >
              {r.active ? 'Active' : 'Inactive'}
            </span>
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          </div>
        </button>
      ))}
    </div>
  )
}

function RedemptionsList() {
  const toast = useToast()
  const [status, setStatus] = useState<RStatus>('pending')
  const { data: rows, isLoading } = useRedemptionsAdmin(status)
  const fulfill = useFulfillRedemption()

  const markFulfilled = (name: string) =>
    fulfill.mutate(name, {
      onSuccess: () => toast('success', 'Marked fulfilled'),
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not update'),
    })

  return (
    <>
      <Segmented
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'fulfilled', label: 'Fulfilled' },
          { value: 'all', label: 'All' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <div className="mt-3">
        {isLoading ? (
          <Spinner className="mx-auto h-5 w-5 text-slate-400" />
        ) : !(rows ?? []).length ? (
          <EmptyState icon={Gift} title="Nothing here" />
        ) : (
          <div className="flex flex-col gap-2">
            {(rows ?? []).map((r) => (
              <div key={r.name} className="rounded-2xl bg-white p-4 shadow-card dark:bg-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{r.reward_name}</p>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                      {r.user_name} · {r.point_cost} pts · {r.redeemed_on_human}
                    </p>
                  </div>
                  {r.status === 'Pending' ? (
                    <button
                      onClick={() => markFulfilled(r.name)}
                      disabled={fulfill.isPending}
                      className="flex shrink-0 items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95 disabled:opacity-60"
                    >
                      <Check className="h-3.5 w-3.5" /> Fulfill
                    </button>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      Fulfilled
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
