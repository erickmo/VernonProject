import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Store, Check, Gift } from 'lucide-react'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { ErrorState, Button } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
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
  // Deep-link ?user=: open straight to that person's redemption (spend) history.
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get('user') ? 'redemptions' : 'rewards'))

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
    <Page>
      <PageHeader icon={Store} title="Marketplace admin" />

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="emerald" title="Manage">
          <div className="mt-1 flex flex-col gap-3">
            <Segmented
              options={[
                { value: 'rewards', label: 'Rewards' },
                { value: 'redemptions', label: 'Redemptions' },
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === 'rewards' && (
              <Button variant="primary" size="sm" onClick={() => navigate('/marketplace-admin/reward/new')}>
                <Plus className="h-4 w-4" /> New reward
              </Button>
            )}
          </div>
        </BentoTile>

        <RewardsSummaryTile tab={tab} />

        <BentoTile span="full" tone="plain">
          {tab === 'rewards' ? <RewardsTable /> : <RedemptionsTable />}
        </BentoTile>
      </BentoGrid>
    </Page>
  )
}

function RewardsSummaryTile({ tab }: { tab: Tab }) {
  const rewardsQ = useRewardsAdmin()
  const redemptionsQ = useRedemptionsAdmin('pending')

  if (tab === 'rewards') {
    const count = rewardsQ.data?.length ?? 0
    const activeCount = rewardsQ.data?.filter((r) => r.active).length ?? 0
    return (
      <BentoTile span="sm" tone="tint" accent="emerald">
        <BentoStat
          value={count}
          label={count === 1 ? 'reward' : 'rewards'}
          delta={`${activeCount} active`}
        />
      </BentoTile>
    )
  }

  const pendingCount = redemptionsQ.data?.length ?? 0
  return (
    <BentoTile span="sm" tone="tint" accent="emerald">
      <BentoStat value={pendingCount} label="pending redemptions" />
    </BentoTile>
  )
}

function RewardsTable() {
  const navigate = useNavigate()
  const q = useRewardsAdmin()
  const { data: rewards, isLoading } = q

  if (isLoading) {
    return <div className="flex justify-center py-20"><Spinner /></div>
  }
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />

  return (
    <DataTable
      rows={rewards ?? []}
      columns={[
        {
          key: 'name',
          header: 'Reward',
          sortValue: (r) => r.reward_name,
          render: (r) => <span className="font-medium text-ink">{r.reward_name}</span>,
        },
        {
          key: 'cost',
          header: 'Point cost',
          align: 'right',
          sortValue: (r) => r.point_cost,
          render: (r) => <span className="whitespace-nowrap text-muted">{formatNumber(r.point_cost)}</span>,
        },
        {
          key: 'stock',
          header: 'Stock',
          align: 'right',
          sortValue: (r) => r.stock_quantity,
          render: (r) => <span className="whitespace-nowrap text-muted">{formatNumber(r.stock_quantity)}</span>,
        },
        {
          key: 'status',
          header: 'Status',
          align: 'right',
          render: (r) => (
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                r.active
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-surface text-muted'
              }`}
            >
              {r.active ? 'Active' : 'Inactive'}
            </span>
          ),
        },
      ]}
      getKey={(r) => r.name}
      onRowClick={(r) => navigate(`/marketplace-admin/reward/${encodeURIComponent(r.name)}`)}
      empty={<EmptyState icon={Store} title="No rewards yet" subtitle="Click New reward to add one." />}
    />
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
  // Deep-link ?user=: show only this person's redemptions.
  const seedUser = new URLSearchParams(window.location.search).get('user') ?? ''
  const shownRows = (rows ?? []).filter((r) => !seedUser || r.user === seedUser)

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
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          rows={shownRows}
          columns={[
            {
              key: 'reward',
              header: 'Reward',
              sortValue: (r) => r.reward_name,
              render: (r) => <span className="font-medium text-ink">{r.reward_name}</span>,
            },
            {
              key: 'user',
              header: 'User',
              sortValue: (r) => r.user_name,
              render: (r) => <span className="text-muted">{r.user_name}</span>,
            },
            {
              key: 'cost',
              header: 'Cost',
              align: 'right',
              sortValue: (r) => r.point_cost,
              render: (r) => <span className="whitespace-nowrap text-muted">{formatNumber(r.point_cost)}</span>,
            },
            {
              key: 'redeemed',
              header: 'Redeemed',
              render: (r) => <span className="whitespace-nowrap text-muted">{r.redeemed_on_human}</span>,
            },
            {
              key: 'actions',
              header: 'Status',
              align: 'right',
              render: (r) =>
                r.status === 'Pending' ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); markFulfilled(r.name) }}
                    disabled={fulfillingName === r.name}
                    className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 active:scale-[0.97] transition disabled:opacity-60"
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
                ),
            },
          ]}
          getKey={(r) => r.name}
          empty={<EmptyState icon={Gift} title="Nothing here" />}
        />
      )}
    </div>
  )
}
