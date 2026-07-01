import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Coins, Wallet, Trophy, Settings } from 'lucide-react'
import { EmptyState, Spinner } from '@/components/ui'
import { useMarketplace, useRedeemReward, useBoot, canManageMarketplace } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { formatNumber } from '@/lib/format'
import type { MarketplaceReward } from '@/lib/types'
import { Dialog } from '@web/components/overlays/Dialog'
import { ErrorState, rowButtonProps, CardGridSkeleton } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

function RewardDetailDialog({
  reward,
  balance,
  pending,
  onRedeem,
  onClose,
}: {
  reward: MarketplaceReward | null
  balance: number
  pending: boolean
  onRedeem: () => void
  onClose: () => void
}) {
  const soldOut = !!reward && reward.stock_quantity <= 0
  const tooPricey = !!reward && reward.point_cost > balance
  const disabled = soldOut || tooPricey || pending
  const after = reward ? balance - reward.point_cost : 0
  return (
    <Dialog
      open={!!reward}
      onClose={() => !pending && onClose()}
      title={reward?.reward_name ?? ''}
      onSubmit={() => !disabled && onRedeem()}
      footer={
        <>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            className="rounded-lg bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={onRedeem}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400"
          >
            {pending ? (
              <Spinner className="h-4 w-4" />
            ) : soldOut ? (
              'Sold out'
            ) : tooPricey ? (
              'Not enough points'
            ) : (
              'Redeem'
            )}
          </button>
        </>
      }
    >
      {reward && (
        <div className="space-y-4">
          <div className="aspect-square w-full max-w-xs mx-auto overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
            {reward.image ? (
              <img src={reward.image} alt={reward.reward_name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
                <Store className="h-10 w-10" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-brand-700 dark:text-brand-300">
              {formatNumber(reward.point_cost)} pts
            </span>
            <span
              className={
                soldOut
                  ? 'rounded-full bg-rose-100 dark:bg-rose-900/40 px-3 py-1 text-xs font-semibold text-rose-600 dark:text-rose-300'
                  : 'rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300'
              }
            >
              {soldOut ? 'Sold out' : `${formatNumber(reward.stock_quantity)} in stock`}
            </span>
          </div>

          {reward.description && (
            <p className="whitespace-pre-line text-sm text-muted">{reward.description}</p>
          )}

          {!disabled && (
            <p className="text-sm text-muted">
              This spends <span className="font-semibold">{formatNumber(reward.point_cost)}</span> points. Balance
              after:{' '}
              <span className="font-semibold">
                {after.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
              .
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}

export default function Marketplace() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const marketplace = useMarketplace()
  const { data, isLoading } = marketplace
  const redeem = useRedeemReward()
  const toast = useToast()
  const [detail, setDetail] = useState<MarketplaceReward | null>(null)

  const balance = data?.balance ?? 0

  const confirm = () => {
    if (!detail) return
    redeem.mutate(detail.name, {
      onSuccess: (res) => {
        toast(
          'success',
          `Redeemed — balance ${res.balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
        )
        setDetail(null)
      },
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not redeem'),
    })
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Marketplace</h1>

      <BentoGrid>
        <BentoTile span="sm" tone="solid" accent="amber" icon={Coins} title="Spendable balance">
          <BentoStat
            value={balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            label="points"
          />
        </BentoTile>

        <BentoTile span="sm" tone="tint" accent="emerald">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/wallet')}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-muted hover:bg-hover/[0.04] transition"
            >
              <Wallet className="h-4 w-4 text-brand-500" />
              Log
            </button>
            <button
              onClick={() => navigate('/leaderboard')}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-muted hover:bg-hover/[0.04] transition"
            >
              <Trophy className="h-4 w-4 text-amber-500" />
              Leaderboard
            </button>
            {canManageMarketplace(boot) && (
              <button
                onClick={() => navigate('/marketplace-admin')}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-muted hover:bg-hover/[0.04] transition"
              >
                <Settings className="h-4 w-4 text-muted" />
                Manage
              </button>
            )}
          </div>
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {marketplace.isError ? (
            <ErrorState onRetry={() => marketplace.refetch()} />
          ) : isLoading && !data ? (
            <CardGridSkeleton />
          ) : !data || data.rewards.length === 0 ? (
            <EmptyState icon={Store} title="No rewards yet" subtitle="Check back soon." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {data.rewards.map((r) => {
                const soldOut = r.stock_quantity <= 0
                return (
                  <div
                    key={r.name}
                    {...rowButtonProps(() => setDetail(r))}
                    aria-label={`View reward ${r.reward_name}`}
                    className="flex flex-col overflow-hidden rounded-lg bg-surface border border-line cursor-pointer hover:border-brand-300 dark:hover:border-brand-500/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
                  >
                    <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800">
                      {r.image ? (
                        <img src={r.image} alt={r.reward_name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
                          <Store className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <p className="text-sm font-semibold text-ink">{r.reward_name}</p>
                      {r.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{r.description}</p>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-bold text-brand-700 dark:text-brand-300">
                          {formatNumber(r.point_cost)} pts
                        </span>
                        {soldOut && <span className="text-[11px] font-semibold text-rose-500">Sold out</span>}
                      </div>
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setDetail(r)
                        }}
                        className="mt-2 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition"
                      >
                        {soldOut ? 'View reward' : 'Redeem'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </BentoTile>
      </BentoGrid>

      <RewardDetailDialog
        reward={detail}
        balance={balance}
        pending={redeem.isPending}
        onRedeem={confirm}
        onClose={() => setDetail(null)}
      />
    </div>
  )
}
