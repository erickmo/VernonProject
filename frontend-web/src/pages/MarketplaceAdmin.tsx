import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Store, Check, Gift } from 'lucide-react'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { ErrorState, rowButtonProps } from '@web/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { formatNumber } from '@/lib/format'
import {
  useBoot,
  canManageMarketplace,
  useRewardsAdmin,
  useRedemptionsAdmin,
  useFulfillRedemption,
} from '@/hooks/useData'

type Tab = 'rewards' | 'redemptions'
type RStatus = 'pending' | 'fulfilled' | 'all'

export default function MarketplaceAdmin() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const [tab, setTab] = useState<Tab>('rewards')

  const blocked = !boot ? false : !canManageMarketplace(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (bootLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }
  if (blocked) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Marketplace Admin</h1>
        {tab === 'rewards' && (
          <button
            onClick={() => navigate('/marketplace-admin/reward/new')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> New reward
          </button>
        )}
      </div>

      <Segmented
        options={[
          { value: 'rewards', label: 'Rewards' },
          { value: 'redemptions', label: 'Redemptions' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'rewards' ? <RewardsTable /> : <RedemptionsTable />}
    </div>
  )
}

function RewardsTable() {
  const navigate = useNavigate()
  const q = useRewardsAdmin()
  const { data: rewards, isLoading } = q

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />
  if (!(rewards ?? []).length) {
    return <EmptyState icon={Store} title="No rewards yet" subtitle="Click New reward to add one." />
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2.5">Reward</th>
            <th className="px-4 py-2.5 text-right">Point cost</th>
            <th className="px-4 py-2.5 text-right">Stock</th>
            <th className="px-4 py-2.5 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {(rewards ?? []).map((r) => (
            <tr
              key={r.name}
              {...rowButtonProps(() =>
                navigate(`/marketplace-admin/reward/${encodeURIComponent(r.name)}`),
              )}
              className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
            >
              <td className="px-4 py-2.5 font-medium">{r.reward_name}</td>
              <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">
                {formatNumber(r.point_cost)}
              </td>
              <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">
                {formatNumber(r.stock_quantity)}
              </td>
              <td className="px-4 py-2.5 text-right">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    r.active
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}
                >
                  {r.active ? 'Active' : 'Inactive'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RedemptionsTable() {
  const toast = useToast()
  const confirm = useConfirm()
  const [status, setStatus] = useState<RStatus>('pending')
  const q = useRedemptionsAdmin(status)
  const { data: rows, isLoading } = q
  const fulfill = useFulfillRedemption()
  const [fulfillingName, setFulfillingName] = useState<string | null>(null)

  const markFulfilled = async (name: string) => {
    const ok = await confirm({
      title: 'Mark this redemption fulfilled?',
      message: 'This action is irreversible.',
      confirmLabel: 'Fulfill',
    })
    if (!ok) return
    setFulfillingName(name)
    fulfill.mutate(name, {
      onSuccess: () => toast('success', 'Marked fulfilled'),
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not update'),
      onSettled: () => setFulfillingName(null),
    })
  }

  return (
    <div className="space-y-4">
      <Segmented
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'fulfilled', label: 'Fulfilled' },
          { value: 'all', label: 'All' },
        ]}
        value={status}
        onChange={setStatus}
      />

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !(rows ?? []).length ? (
        <EmptyState icon={Gift} title="Nothing here" />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Reward</th>
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5 text-right">Cost</th>
                <th className="px-4 py-2.5 whitespace-nowrap">Redeemed</th>
                <th className="px-4 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(rows ?? []).map((r) => (
                <tr key={r.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2.5 font-medium">{r.reward_name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.user_name}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">
                    {formatNumber(r.point_cost)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{r.redeemed_on_human}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.status === 'Pending' ? (
                      <button
                        onClick={() => markFulfilled(r.name)}
                        disabled={fulfillingName === r.name}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                      >
                        {fulfillingName === r.name ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}{' '}
                        Fulfill
                      </button>
                    ) : (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        Fulfilled
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
