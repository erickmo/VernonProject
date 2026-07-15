import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Sparkles } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { useNotifications, useMarkRead, useMarkAllRead } from '@/hooks/useData'
import { useAppUpdate } from '@/lib/appUpdate'
import {
  TYPE_ICON,
  deepLink,
  groupNotifications,
  typeTabs,
  type NotificationGroup,
} from '@/lib/notifications'
import type { NotificationType } from '@/lib/types'

const ROUTES = {
  exceptionApprovals: '/attendance/approvals',
  myExceptions: '/attendance/my-requests',
  hrExceptions: '/attendance/manage/exceptions',
}

function TabChip({
  label,
  active,
  unread,
  onClick,
}: {
  label: string
  active: boolean
  unread: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold active:scale-95 ${
        active
          ? 'bg-brand-500 text-white'
          : 'bg-paper-line text-stone-500 dark:bg-slate-700 dark:text-slate-300'
      }`}
    >
      {label}
      {unread > 0 && <span className={active ? 'ml-1 text-white/80' : 'ml-1 text-brand-500'}>{unread}</span>}
    </button>
  )
}

export default function NotificationsScreen() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useNotifications()
  const { updateAvailable, applyUpdate } = useAppUpdate()
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const [tab, setTab] = useState<NotificationType | null>(null)

  const groups = useMemo(() => groupNotifications(data?.items ?? []), [data?.items])
  const tabs = useMemo(() => typeTabs(groups), [groups])
  // A filtered-to-empty tab would strand the user, so fall back to All.
  const active = tab && tabs.some((t) => t.type === tab) ? tab : null
  const items = active ? groups.filter((g) => g.head.type === active) : groups

  const open = (g: NotificationGroup) => {
    if (g.unread) markRead.mutate(g.names)
    navigate(deepLink(g.head, ROUTES))
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
          {tabs.length > 1 && (
            <div className="-mx-4 mb-1 flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {/* Counts collapsed groups, so it agrees with the sibling chips and
                  the list. The bell badge keeps the true global count. */}
              <TabChip
                label="All"
                active={!active}
                onClick={() => setTab(null)}
                unread={groups.filter((g) => g.unread).length}
              />
              {tabs.map((t) => (
                <TabChip
                  key={t.type}
                  label={t.type}
                  active={active === t.type}
                  onClick={() => setTab(t.type)}
                  unread={t.unread}
                />
              ))}
            </div>
          )}
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
              {items.map((g) => {
                const n = g.head
                const Icon = TYPE_ICON[n.type] ?? Bell
                return (
                  <li key={g.key}>
                    <button
                      onClick={() => open(g)}
                      className="flex w-full items-start gap-3 px-1 py-3 text-left active:bg-paper-line dark:active:bg-slate-700/50"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          g.unread ? 'bg-brand-500' : 'bg-transparent'
                        }`}
                      />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-500 dark:bg-slate-700 dark:text-slate-300">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                          {n.type}
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
                      {g.count > 1 && (
                        <span className="mt-1 shrink-0 rounded-full bg-paper-line px-2 py-0.5 text-[11px] font-semibold text-stone-500 dark:bg-slate-700 dark:text-slate-300">
                          {g.count}
                        </span>
                      )}
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
