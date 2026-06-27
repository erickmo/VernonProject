import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useNotifications } from '@/hooks/useData'
import { NotificationSheet } from '@web/components/NotificationSheet'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { data } = useNotifications()
  const unread = data?.unread ?? 0

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative rounded-lg p-2 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
