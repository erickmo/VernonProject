import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Sparkles } from 'lucide-react'
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
import { Drawer } from '@web/components/overlays/Drawer'
import { Button, Skeleton, ErrorState } from '@web/components/ui'

const ROUTES = {
  exceptionApprovals: '/attendance/my-approvals',
  // /attendance/exceptions is the admin screen; web has no requester-side list,
  // so a cuti verdict has nowhere better to land than home.
  myExceptions: '/',
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
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
        active ? 'bg-brand-500 text-white' : 'bg-hover/[0.06] text-muted hover:bg-hover/[0.1] dark:bg-slate-700 dark:text-slate-300'
      }`}
    >
      {label}
      {unread > 0 && <span className={active ? 'ml-1 text-white/80' : 'ml-1 text-brand-500'}>{unread}</span>}
    </button>
  )
}

export function NotificationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {

  const { data, isLoading, isError, refetch } = useNotifications()
  const { updateAvailable, applyUpdate } = useAppUpdate()
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const navigate = useNavigate()
  const [tab, setTab] = useState<NotificationType | null>(null)

  const groups = useMemo(() => groupNotifications(data?.items ?? []), [data?.items])
  const tabs = useMemo(() => typeTabs(groups), [groups])
  // A filtered-to-empty tab would strand the user, so fall back to All.
  const active = tab && tabs.some((t) => t.type === tab) ? tab : null
  const items = active ? groups.filter((g) => g.head.type === active) : groups
  const unread = data?.unread ?? 0

  function openItem(g: NotificationGroup) {
    if (g.unread) markRead.mutate(g.names)
    onClose()
    navigate(deepLink(g.head, ROUTES))
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Notifications"
      scrim="bg-black/20"
      footer={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending || unread === 0}
        >
          <CheckCheck className="w-4 h-4" /> Mark all read
        </Button>
      }
    >
      {updateAvailable && (
        <button
          onClick={() => applyUpdate()}
          className="-mx-5 mb-1 flex w-[calc(100%+2.5rem)] items-start gap-3 border-b border-line bg-brand-50 px-5 py-3 text-left hover:bg-brand-100 dark:bg-brand-500/15 dark:hover:bg-brand-500/25"
        >
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-brand-700 dark:text-brand-300">
              Update available
            </span>
            <span className="block text-sm text-muted dark:text-slate-400">
              Click to load the latest version
            </span>
          </span>
        </button>
      )}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted dark:text-slate-500">
          <Bell className="h-8 w-8" />
          <p className="text-sm">No notifications yet</p>
        </div>
      ) : (
        <>
          {tabs.length > 1 && (
            <div className="-mx-5 mb-1 flex gap-2 overflow-x-auto border-b border-line px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {/* Counts collapsed groups, so it agrees with the sibling chips and
                  the list. The bell badge keeps the true global count. */}
              <TabChip
                label="All"
                active={!active}
                unread={groups.filter((g) => g.unread).length}
                onClick={() => setTab(null)}
              />
              {tabs.map((t) => (
                <TabChip
                  key={t.type}
                  label={t.type}
                  active={active === t.type}
                  unread={t.unread}
                  onClick={() => setTab(t.type)}
                />
              ))}
            </div>
          )}
          <ul className="-mx-5 divide-y divide-line">
            {items.map((g) => {
              const n = g.head
              const Icon = TYPE_ICON[n.type] ?? Bell
              return (
                <li key={g.key}>
                  <button
                    onClick={() => openItem(g)}
                    className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-hover/[0.04]"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        g.unread ? 'bg-brand-500' : 'bg-transparent'
                      }`}
                    />
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hover/[0.06] text-muted dark:bg-slate-700 dark:text-slate-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink dark:text-slate-100">
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="block truncate text-sm text-muted dark:text-slate-400">
                          {n.body}
                        </span>
                      )}
                      {n.at_human && (
                        <span className="block text-xs text-muted dark:text-slate-500">
                          {n.at_human}
                        </span>
                      )}
                    </span>
                    {g.count > 1 && (
                      <span className="mt-1 shrink-0 rounded-full bg-hover/[0.06] px-2 py-0.5 text-[11px] font-semibold text-muted dark:bg-slate-700 dark:text-slate-300">
                        {g.count}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Drawer>
  )
}
