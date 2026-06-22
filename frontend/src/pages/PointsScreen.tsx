import { useNavigate } from 'react-router-dom'
import { Coins, Wallet, Trophy, Store, Settings, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { useBoot, useWallet, canManageMarketplace } from '@/hooks/useData'

function Row({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 active:bg-slate-50 dark:active:bg-slate-700/50"
    >
      <Icon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
    </button>
  )
}

export default function PointsScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const { data: wallet } = useWallet()

  return (
    <DetailScreen title="Points">
      {/* Balance header */}
      <div className="mb-4 flex items-center gap-3 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-card">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
          <Coins className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-200">Spendable balance</p>
          <p className="text-2xl font-bold leading-tight">
            {(wallet?.balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </p>
        </div>
      </div>

      {/* Navigation rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card">
        <Row icon={Wallet} label="Points log" onClick={() => navigate('/wallet')} />
        <Row icon={Trophy} label="Leaderboard" onClick={() => navigate('/leaderboard')} />
        <Row icon={Store} label="Marketplace" onClick={() => navigate('/marketplace')} />
        {canManageMarketplace(boot) && (
          <Row icon={Settings} label="Manage Marketplace" onClick={() => navigate('/marketplace-admin')} />
        )}
      </div>
    </DetailScreen>
  )
}
