import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useNotifications } from '@/hooks/useData'
import { useAppUpdate } from '@/lib/appUpdate'
import { NotificationSheet } from '@web/components/NotificationSheet'

export function NotificationBell({ className = 'text-muted hover:bg-hover/[0.04]' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const { data } = useNotifications()
  const { updateAvailable } = useAppUpdate()
  const unread = (data?.unread ?? 0) + (updateAvailable ? 1 : 0)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className={`relative rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${className}`}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <NotificationSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
