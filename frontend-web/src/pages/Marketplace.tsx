import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Coins, Wallet, Trophy, Settings, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { EmptyState, Spinner } from '@/components/ui'
import { useMarketplace, useRedeemReward, useBoot, canManageMarketplace, useWallet } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { formatNumber } from '@/lib/format'
import type { MarketplaceReward } from '@/lib/types'
import { Sheet } from '@web/components/Sheet'
import { ErrorState, rowButtonProps, CardGridSkeleton, Button } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'

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
    <Sheet open={!!reward} onClose={() => !pending && onClose()} title={reward?.reward_name ?? ''} size="sm">
      {reward && (
        <div className="space-y-4">
          <div className="aspect-square w-full max-w-xs mx-auto overflow-hidden rounded-2xl bg-canvas">
            {reward.image ? (
              <img src={reward.image} alt={reward.reward_name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted dark:text-slate-600">
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

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => !pending && onClose()} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onRedeem} disabled={disabled}>
              {pending ? (
                <Spinner className="h-4 w-4" />
              ) : soldOut ? (
                'Sold out'
              ) : tooPricey ? (
                'Not enough points'
              ) : (
                'Redeem'
              )}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

export default function Marketplace() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const marketplace = useMarketplace()
  const { data, isLoading } = marketplace
  const { data: wallet } = useWallet()
  const redeem = useRedeemReward()
  const toast = useToast()
  const [detail, setDetail] = useState<MarketplaceReward | null>(null)

  const balance = data?.balance ?? 0
  const today = wallet?.today_earned ?? 0
  const yesterday = wallet?.yesterday_earned ?? 0
  const delta = today - yesterday
  const Trend = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const trendLabel =
    delta > 0 ? `+${formatNumber(delta)} vs yesterday`
    : delta < 0 ? `−${formatNumber(-delta)} vs yesterday`
    : 'Same as yesterday'
  const trendColor = delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : delta < 0 ? 'text-rose-500' : 'text-muted'

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
    <Page>
      <PageHeader icon={Store} title="Marketplace" />

      <BentoGrid>
        <BentoTile span="sm" tone="solid" accent="amber" icon={Coins} title="Spendable balance">
          <BentoStat
            value={balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            label="points"
          />
        </BentoTile>

        <BentoTile span="sm" tone="tint" accent="emerald" icon={TrendingUp} title="Earned today">
          <BentoStat
            value={`+${formatNumber(today)}`}
            label="points today"
            delta={
              <span className={`inline-flex items-center gap-1 font-semibold ${trendColor}`}>
                <Trend className="h-3 w-3" />
                {trendLabel}
              </span>
            }
          />
        </BentoTile>

        <BentoTile span="sm" tone="tint" accent="emerald">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/wallet')}>
              <Wallet className="h-4 w-4 text-brand-500" />
              Log
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate('/leaderboard')}>
              <Trophy className="h-4 w-4 text-amber-500" />
              Leaderboard
            </Button>
            {canManageMarketplace(boot) && (
              <Button variant="secondary" size="sm" onClick={() => navigate('/marketplace-admin')}>
                <Settings className="h-4 w-4 text-muted" />
                Manage
              </Button>
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
                    className="flex flex-col overflow-hidden rounded-2xl bg-surface border border-line cursor-pointer hover:border-brand-300 dark:hover:border-brand-500/40 active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
                  >
                    <div className="aspect-square w-full bg-canvas">
                      {r.image ? (
                        <img src={r.image} alt={r.reward_name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted dark:text-slate-600">
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
                        className="mt-2 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.99] transition"
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
    </Page>
  )
}
