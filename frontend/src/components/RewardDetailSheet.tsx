import { Store, X } from 'lucide-react'
import { formatNumber, effectivePoints, hasPromo } from '@/lib/format'
import type { MarketplaceReward } from '@/lib/types'

export function RewardDetailSheet({
  reward,
  balance,
  onRedeem,
  onClose,
}: {
  reward: MarketplaceReward | null
  balance: number
  onRedeem: () => void
  onClose: () => void
}) {
  if (!reward) return null
  const soldOut = reward.stock_quantity <= 0
  const price = effectivePoints(reward)
  const promo = hasPromo(reward)
  const tooPricey = price > balance
  const disabled = soldOut || tooPricey
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative mx-auto max-h-[90vh] w-full sm:max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{reward.reward_name}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="aspect-square w-full overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-700">
          {reward.image ? (
            <img src={reward.image} alt={reward.reward_name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
              <Store className="h-10 w-10" />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-brand-700 dark:text-brand-300">{formatNumber(price)} pts</span>
            {promo && (
              <>
                <span className="text-sm font-medium text-slate-400 line-through dark:text-slate-500">{formatNumber(reward.point_cost)}</span>
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Promo</span>
              </>
            )}
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
          <p className="mt-3 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{reward.description}</p>
        )}

        <button
          onClick={onRedeem}
          disabled={disabled}
          className="mt-5 w-full rounded-2xl bg-brand-600 py-3 font-semibold text-white disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400"
        >
          {soldOut ? 'Sold out' : tooPricey ? 'Not enough points' : 'Redeem'}
        </button>
      </div>
    </div>
  )
}
