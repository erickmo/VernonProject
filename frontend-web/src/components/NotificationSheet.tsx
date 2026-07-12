import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Sparkles } from 'lucide-react'
import { useNotifications, useMarkRead, useMarkAllRead } from '@/hooks/useData'
import { useAppUpdate } from '@/lib/appUpdate'
import type { AppNotification } from '@/lib/types'
import { Drawer } from '@web/components/overlays/Drawer'
import { Button, Skeleton, ErrorState } from '@web/components/ui'

// Same route table as the mobile sheet — web exposes the identical paths.
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

export function NotificationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useNotifications()
  const { updateAvailable, applyUpdate } = useAppUpdate()
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const navigate = useNavigate()

  const items = data?.items ?? []
  const unread = data?.unread ?? 0

  function openItem(n: AppNotification) {
    if (!n.is_read) markRead.mutate(n.name)
    onClose()
    navigate(deepLink(n))
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
        <ul className="-mx-5 divide-y divide-line">
          {items.map((n) => (
            <li key={n.name}>
              <button
                onClick={() => openItem(n)}
                className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-hover/[0.04]"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.is_read ? 'bg-transparent' : 'bg-brand-500'
                  }`}
                />
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
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  )
}
