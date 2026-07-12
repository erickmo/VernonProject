import { Hand, PartyPopper, Flame, Heart, CheckCircle2, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { Avatar, EmptyState, Spinner } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useTeamActivity, useToggleReaction } from '@/hooks/useData'
import type { ActivityItem, ReactionKey } from '@/lib/types'

const REACTIONS: { key: ReactionKey; icon: LucideIcon; tint: string }[] = [
  { key: 'clap', icon: Hand, tint: 'text-amber-500' },
  { key: 'celebrate', icon: PartyPopper, tint: 'text-violet-500' },
  { key: 'fire', icon: Flame, tint: 'text-orange-500' },
  { key: 'heart', icon: Heart, tint: 'text-rose-500' },
]

function ReactionBar({ item }: { item: ActivityItem }) {
  const toggle = useToggleReaction()

  // You can't react to your own work (the server rejects it). On your own card
  // show the kudos you've received as read-only chips, and nothing until someone cheers.
  if (item.is_mine) {
    const got = REACTIONS.filter(({ key }) => item.reactions[key] > 0)
    if (got.length === 0) return null
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {got.map(({ key, icon: Icon, tint }) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-sm font-semibold text-muted"
          >
            <Icon className={clsx('h-4 w-4', tint)} />
            <span className="tabular-nums">{item.reactions[key]}</span>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {REACTIONS.map(({ key, icon: Icon, tint }) => {
        const count = item.reactions[key]
        const active = item.my_reaction === key
        return (
          <button
            key={key}
            onClick={() => toggle.mutate({ todo: item.name, reaction: key })}
            aria-label={key}
            aria-pressed={active}
            className={clsx(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-semibold transition active:scale-95',
              active
                ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-300'
                : 'border-line bg-surface text-muted hover:bg-hover/[0.04]',
            )}
          >
            <Icon className={clsx('h-4 w-4', active ? 'text-brand-600 dark:text-brand-300' : tint)} />
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

function ActivityCard({ item }: { item: ActivityItem }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <Avatar name={item.assigned_to_name} image={item.assigned_to_image ?? undefined} config={item.assigned_to_avatar_config} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{item.assigned_to_name}</span> completed
          </p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-ink">{item.to_do}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span className="truncate">
              {item.project_name}
              {item.completed_at_human ? ` · ${item.completed_at_human}` : ''}
            </span>
          </p>
        </div>
        {item.point > 0 && (
          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            +{item.point.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </span>
        )}
      </div>
      <ReactionBar item={item} />
      {item.total > 0 && item.reactors.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          {item.reactors.join(', ')}
          {item.total > item.reactors.length ? ` +${item.total - item.reactors.length} more` : ''}
        </p>
      )}
    </div>
  )
}

export default function Activity() {
  const q = useTeamActivity()
  const { data, isLoading } = q
  const items = data ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Team Activity</h1>
      </div>

      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : isLoading && !data ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No recent wins yet"
          subtitle="Completed work from your projects shows up here — cheer your teammates on."
        />
      ) : (
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {items.map((it) => (
            <ActivityCard key={it.name} item={it} />
          ))}
        </div>
      )}
    </div>
  )
}
