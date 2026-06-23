import { Spinner } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import type { MarketplaceReward } from '@/lib/types'

export function RedeemSheet({
  reward,
  balance,
  pending,
  onConfirm,
  onClose,
}: {
  reward: MarketplaceReward | null
  balance: number
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  if (!reward) return null
  const after = balance - reward.point_cost
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative mx-auto w-full max-w-md rounded-t-3xl bg-white dark:bg-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Redeem {reward.reward_name}?</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          This spends <span className="font-semibold">{formatNumber(reward.point_cost)}</span> points. Balance after:{' '}
          <span className="font-semibold">{after.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-2xl bg-slate-100 dark:bg-slate-700 py-3 font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-60"
          >
            {pending ? <Spinner className="h-4 w-4" /> : 'Redeem'}
          </button>
        </div>
      </div>
    </div>
  )
}
