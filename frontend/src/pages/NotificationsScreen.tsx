import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ClipboardList, MessageCircle, AtSign, Coins, Gift, Hand, MessageSquareText, AlarmClock, Heart, CalendarClock, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { useNotifications, useMarkRead, useMarkAllRead } from '@/hooks/useData'
import { useAppUpdate } from '@/lib/appUpdate'
import type { AppNotification, NotificationType } from '@/lib/types'

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  Assignment: ClipboardList,
  Approval: CheckCheck,
  Comment: MessageCircle,
  Mention: AtSign,
  Points: Coins,
  Redemption: Gift,
  Kudos: Hand,
  Feedback: MessageSquareText,
  Deadline: AlarmClock,
  Encouragement: Heart,
  Attendance: CalendarClock,
}

const TYPE_LABEL: Record<NotificationType, string> = {
  Assignment: 'Assignment',
  Approval: 'Approval',
  Comment: 'Comment',
  Mention: 'Mention',
  Points: 'Points',
  Redemption: 'Redemption',
  Kudos: 'Kudos',
  Feedback: 'Feedback',
  Deadline: 'Deadline',
  Encouragement: 'Encouragement',
  Attendance: 'Attendance',
}

function deepLink(n: AppNotification): string {
  const d = n.reference_doctype || ''
  const name = n.reference_name || ''
  if (d === 'Project Todo' && name) return `/project-item/${encodeURIComponent(name)}`
  if (d === 'Project Detail' && name) return `/project-detail/${encodeURIComponent(name)}`
  if (d === 'Project' && name) return `/project/${encodeURIComponent(name)}`
  if (d === 'Wallet') return '/wallet'
  if (d === 'Reward Redemption') return '/marketplace'
  // Attendance heads-up: the penalty shows in the wallet ledger.
  if (d === 'Daily Attendance') return '/wallet'
  return '/'
}

export default function NotificationsScreen() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useNotifications()
  const { updateAvailable, applyUpdate } = useAppUpdate()
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const items = data?.items ?? []

  const open = (n: AppNotification) => {
    if (!n.is_read) markRead.mutate(n.name)
    navigate(deepLink(n))
  }

  const markAllButton = (
    <button
      onClick={() => markAll.mutate()}
      disabled={markAll.isPending || (data?.unread ?? 0) === 0}
      className="inline-flex items-center gap-1 rounded-full bg-paper-line px-3 py-1.5 text-xs font-semibold text-stone-500 active:scale-95 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200"
    >
      <CheckCheck className="h-3.5 w-3.5" /> Mark all read
    </button>
  )

  return (
    <DetailScreen title="Notifications" right={items.length > 0 ? markAllButton : undefined}>
      {isLoading && !data ? (
        <FullScreenLoader label="Loading notifications…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {items.length === 0 && !updateAvailable ? (
            <EmptyState icon={Bell} title="No notifications yet" />
          ) : (
            <ul className="divide-y divide-paper-edge dark:divide-slate-700">
              {updateAvailable && (
                <li>
                  <button
                    onClick={applyUpdate}
                    className="flex w-full items-start gap-3 rounded-2xl bg-brand-50 px-3 py-3 text-left dark:bg-brand-500/15 active:scale-[0.99]"
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/25 dark:text-brand-300">
                      <Sparkles className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-brand-500 dark:text-brand-400">
                        Update
                      </span>
                      <span className="block text-sm font-semibold text-stone-800 dark:text-slate-50">
                        Update available
                      </span>
                      <span className="mt-0.5 block text-sm text-stone-500 dark:text-slate-400">
                        Tap to load the latest version
                      </span>
                    </span>
                  </button>
                </li>
              )}
              {items.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Bell
                return (
                  <li key={n.name}>
                    <button
                      onClick={() => open(n)}
                      className="flex w-full items-start gap-3 px-1 py-3 text-left active:bg-paper-line dark:active:bg-slate-700/50"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          n.is_read ? 'bg-transparent' : 'bg-brand-500'
                        }`}
                      />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-500 dark:bg-slate-700 dark:text-slate-300">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                          {TYPE_LABEL[n.type] ?? n.type}
                        </span>
                        <span className="block text-sm font-semibold text-stone-800 dark:text-slate-50">
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block truncate text-sm text-stone-500 dark:text-slate-400">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-xs text-stone-400 dark:text-slate-500">
                          {n.at_human}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </PullToRefresh>
      )}
    </DetailScreen>
  )
}
