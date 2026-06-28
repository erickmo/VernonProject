import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ClipboardList, MessageCircle, AtSign, Coins, Gift, Hand } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { EmptyState, Spinner } from '@/components/ui'
import { useNotifications, useMarkRead, useMarkAllRead } from '@/hooks/useData'
import type { AppNotification, NotificationType } from '@/lib/types'

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  Assignment: ClipboardList,
  Approval: CheckCheck,
  Comment: MessageCircle,
  Mention: AtSign,
  Points: Coins,
  Redemption: Gift,
  Kudos: Hand,
}

const TYPE_LABEL: Record<NotificationType, string> = {
  Assignment: 'Assignment',
  Approval: 'Approval',
  Comment: 'Comment',
  Mention: 'Mention',
  Points: 'Points',
  Redemption: 'Redemption',
  Kudos: 'Kudos',
}

function deepLink(n: AppNotification): string {
  const d = n.reference_doctype || ''
  const name = n.reference_name || ''
  if (d === 'Project Todo' && name) return `/project-item/${encodeURIComponent(name)}`
  if (d === 'Project Detail' && name) return `/project-detail/${encodeURIComponent(name)}`
  if (d === 'Project' && name) return `/project/${encodeURIComponent(name)}`
  if (d === 'Wallet') return '/wallet'
  if (d === 'Reward Redemption') return '/marketplace'
  return '/'
}

export function NotificationSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { data, isLoading } = useNotifications()
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const items = data?.items ?? []

  const open = (n: AppNotification) => {
    if (!n.is_read) markRead.mutate(n.name)
    onClose()
    navigate(deepLink(n))
  }

  // Mirrors the FAB drawer (QuickAddSheet → SheetShell): tap-scrim-to-close,
  // rounded-top paper panel, drag handle, safe-area bottom padding.
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative mx-auto flex max-h-[80vh] w-full max-w-[448px] flex-col overflow-y-auto rounded-t-3xl bg-paper-card p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-paper-line dark:bg-slate-600" />
        <div className="mb-4 flex items-center gap-2">
          <h2 className="flex-1 font-display text-lg font-semibold text-stone-800 dark:text-slate-50">
            Notifications
          </h2>
          <button
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending || (data?.unread ?? 0) === 0}
            className="inline-flex items-center gap-1 rounded-full bg-paper-line px-3 py-1.5 text-xs font-semibold text-stone-500 active:scale-95 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6 text-stone-400" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications yet" />
        ) : (
          <ul className="divide-y divide-paper-edge dark:divide-slate-700">
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
      </div>
    </div>
  )
}
