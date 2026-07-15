import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Wallet, CheckCircle2, Crown, Sparkles, CalendarCheck, Users, Fingerprint,
  GraduationCap, Award, Sun, Heart, MessageSquare, Gift, ShoppingBag, Shirt, Ticket,
} from 'lucide-react'
import clsx from 'clsx'
import { EmptyState, Spinner } from '@/components/ui'
import { useWallet, useWalletLog } from '@/hooks/useData'
import { formatNumber } from '@/lib/format'
import { todayISO, parseISO, fmtISO } from '@web/lib/dateGrid'
import type { WalletLogEntry } from '@/lib/types'
import { ErrorState } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { rise } from '@web/components/Page'

// Signed amount, keeping up to 1 fraction digit (points can be fractional).
const fmt = (n: number) => (n > 0 ? '+' : '') + n.toLocaleString(undefined, { maximumFractionDigits: 1 })

// category slug (from get_wallet_log) -> icon + soft chip. Colour is category
// identity only; the +/- amount below carries the money-in/out signal.
const CATS: Record<string, { icon: LucideIcon; chip: string }> = {
  task:        { icon: CheckCircle2,  chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' },
  leader:      { icon: Crown,         chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  mentor:      { icon: Sparkles,      chip: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400' },
  attended:    { icon: CalendarCheck, chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400' },
  meeting:     { icon: Users,         chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400' },
  attendance:  { icon: Fingerprint,   chip: 'bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400' },
  learning:    { icon: GraduationCap, chip: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400' },
  achievement: { icon: Award,         chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  daily:       { icon: Sun,           chip: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400' },
  recognition: { icon: Heart,         chip: 'bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400' },
  feedback:    { icon: MessageSquare, chip: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400' },
  mentoring:   { icon: Sparkles,      chip: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400' },
  reward:      { icon: Gift,          chip: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400' },
  grant:       { icon: Gift,          chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' },
  gift_in:     { icon: Gift,          chip: 'bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400' },
  gift_out:    { icon: Gift,          chip: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400' },
  marketplace: { icon: ShoppingBag,   chip: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400' },
  avatar:      { icon: Shirt,         chip: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400' },
  event:       { icon: Ticket,        chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400' },
}
const FALLBACK = { icon: Wallet, chip: 'bg-black/[0.04] text-muted dark:bg-white/[0.06]' }

// Human day heading. iso is a YYYY-MM-DD (from the row's Datetime, sliced).
function dayLabel(iso: string): string {
  const t = parseISO(todayISO())!
  if (iso === todayISO()) return 'Today'
  const y = new Date(t.y, t.m - 1, t.d - 1)
  if (iso === fmtISO(y.getFullYear(), y.getMonth() + 1, y.getDate())) return 'Yesterday'
  const d = parseISO(iso)
  if (!d) return iso
  return new Date(d.y, d.m - 1, d.d).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

type Group = { key: string; label: string; net: number; rows: WalletLogEntry[] }

// Bucket the (already newest-first) log by calendar day, preserving order.
function groupByDay(rows: WalletLogEntry[]): Group[] {
  const groups: Group[] = []
  const idx = new Map<string, number>()
  for (const e of rows) {
    const key = e.date ? e.date.slice(0, 10) : ''
    let gi = idx.get(key)
    if (gi === undefined) {
      gi = groups.length
      idx.set(key, gi)
      groups.push({ key, label: key ? dayLabel(key) : 'Earlier', net: 0, rows: [] })
    }
    groups[gi].rows.push(e)
    groups[gi].net += e.amount
  }
  return groups
}

const FILTERS = ['all', 'earned', 'spent'] as const
type Filter = (typeof FILTERS)[number]

export default function WalletLog() {
  const { data: wallet } = useWallet()
  const logQuery = useWalletLog()
  const { data: log, isLoading } = logQuery
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = (log ?? []).filter((e) =>
    filter === 'all' ? true : filter === 'earned' ? e.kind === 'credit' : e.kind === 'debit',
  )
  const groups = groupByDay(filtered)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Points log</h1>

      <BentoGrid>
        <BentoTile span="md" tall tone="solid" accent="amber" icon={Wallet} title="Spendable balance">
          <BentoStat value={formatNumber(wallet?.balance ?? 0)} label="balance" />
        </BentoTile>

        <BentoTile span="sm" tone="tint" accent="amber" title="Earned today">
          <BentoStat value={`+${formatNumber(wallet?.today_earned ?? 0)}`} label="today" />
        </BentoTile>

        <BentoTile span="sm" tone="tint" accent="amber" title="Summary">
          <dl className="space-y-2 text-sm pt-1">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Total earned</dt>
              <dd className="font-semibold tabular-nums">{formatNumber(wallet?.earned ?? 0)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Total redeemed</dt>
              <dd className="font-semibold tabular-nums">{formatNumber(wallet?.redeemed ?? 0)}</dd>
            </div>
          </dl>
        </BentoTile>
      </BentoGrid>

      {/* Activity header + earned/spent filter */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Activity</h2>
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {FILTERS.map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={clsx(
                'rounded-md px-3.5 py-1.5 text-sm font-semibold capitalize transition',
                filter === k ? 'bg-brand-600 text-white shadow-sm' : 'text-muted hover:bg-hover/[0.04]',
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {logQuery.isError ? (
        <ErrorState onRetry={() => logQuery.refetch()} />
      ) : isLoading && !log ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !log || log.length === 0 ? (
        <EmptyState icon={Wallet} title="No activity yet" subtitle="Earned and spent points will show up here." />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={filter === 'spent' ? ShoppingBag : CheckCircle2}
          title={filter === 'spent' ? 'Nothing spent yet' : 'Nothing earned yet'}
          subtitle="Try a different filter."
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g, gi) => (
            <div key={g.key || gi} {...rise(gi)}>
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{g.label}</h3>
                <span className="text-xs font-medium tabular-nums text-muted">{fmt(g.net)}</span>
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-card">
                {g.rows.map((e, i) => {
                  const credit = e.kind === 'credit'
                  const cat = (e.category && CATS[e.category]) || FALLBACK
                  const Icon = cat.icon
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cat.chip)}>
                        <Icon className="h-[18px] w-[18px]" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{e.title}</p>
                        {(e.subtitle || e.status) && (
                          <p className="truncate text-xs text-muted">
                            {[e.subtitle, e.status].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={clsx(
                            'text-sm font-bold tabular-nums',
                            credit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                          )}
                        >
                          {fmt(e.amount)}
                        </p>
                        <p className="text-[11px] tabular-nums text-muted">bal {formatNumber(e.balance)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
