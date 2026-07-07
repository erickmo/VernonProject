import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Coins, Wallet, Trophy, Settings, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { RedeemSheet } from '@/components/RedeemSheet'
import { RewardDetailSheet } from '@/components/RewardDetailSheet'
import { useMarketplace, useRedeemReward, useBoot, canManageMarketplace, useWallet } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { formatNumber } from '@/lib/format'
import type { MarketplaceReward } from '@/lib/types'

export default function MarketplaceScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const { data, isLoading } = useMarketplace()
  const { data: wallet } = useWallet()
  const redeem = useRedeemReward()
  const toast = useToast()
  const [detail, setDetail] = useState<MarketplaceReward | null>(null)
  const [selected, setSelected] = useState<MarketplaceReward | null>(null)

  const balance = data?.balance ?? 0
  const today = wallet?.today_earned ?? 0
  const yesterday = wallet?.yesterday_earned ?? 0
  const delta = today - yesterday
  const Trend = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const trendLabel =
    delta > 0 ? `+${formatNumber(delta)} vs yesterday`
    : delta < 0 ? `−${formatNumber(-delta)} vs yesterday`
    : 'Same as yesterday'

  const confirm = () => {
    if (!selected) return
    redeem.mutate(selected.name, {
      onSuccess: (res) => {
        toast('success', `Redeemed — balance ${res.balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}`)
        setSelected(null)
      },
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not redeem'),
    })
  }

  return (
    <DetailScreen title="Marketplace">
      <div className="mb-3 flex items-center justify-between gap-3 rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-pink-500 p-5 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/80">Spendable balance</p>
            <p className="text-2xl font-bold leading-tight">
              {balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-white/80">Today</p>
          <p className="text-lg font-bold leading-tight">+{formatNumber(today)}</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
            <Trend className="h-3 w-3" />
            {trendLabel}
          </span>
        </div>
      </div>

      {/* Menu row */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => navigate('/wallet')}
          className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-white dark:bg-slate-800 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-sm active:scale-95 transition"
        >
          <Wallet className="h-4 w-4 text-brand-500" />
          Log
        </button>
        <button
          onClick={() => navigate('/leaderboard')}
          className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-white dark:bg-slate-800 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-sm active:scale-95 transition"
        >
          <Trophy className="h-4 w-4 text-amber-500" />
          Leaderboard
        </button>
        {canManageMarketplace(boot) && (
          <button
            onClick={() => navigate('/marketplace-admin')}
            className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-white dark:bg-slate-800 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-sm active:scale-95 transition"
          >
            <Settings className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            Manage
          </button>
        )}
      </div>

      {isLoading && !data ? (
        <FullScreenLoader />
      ) : !data || data.rewards.length === 0 ? (
        <EmptyState icon={Store} title="No rewards yet" subtitle="Check back soon." />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {data.rewards.map((r) => {
            const soldOut = r.stock_quantity <= 0
            const tooPricey = r.point_cost > balance
            const disabled = soldOut || tooPricey
            return (
              <div key={r.name} className="flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="aspect-square w-full bg-amber-50 dark:bg-amber-500/15">
                  {r.image ? (
                    <img src={r.image} alt={r.reward_name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-amber-600 dark:text-amber-400">
                      <Store className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.reward_name}</p>
                  {r.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-400 dark:text-slate-500">{r.description}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-brand-700 dark:text-brand-300">{formatNumber(r.point_cost)} pts</span>
                    {soldOut && <span className="text-[11px] font-semibold text-rose-500">Sold out</span>}
                  </div>
                  <button
                    onClick={() => setDetail(r)}
                    className="mt-2 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white"
                  >
                    View
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <RewardDetailSheet
        reward={detail}
        balance={balance}
        onRedeem={() => {
          if (!detail) return
          setSelected(detail)
          setDetail(null)
        }}
        onClose={() => setDetail(null)}
      />

      <RedeemSheet
        reward={selected}
        balance={balance}
        pending={redeem.isPending}
        onConfirm={confirm}
        onClose={() => !redeem.isPending && setSelected(null)}
      />
    </DetailScreen>
  )
}
