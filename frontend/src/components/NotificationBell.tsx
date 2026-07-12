import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useNotifications } from '@/hooks/useData'
import { useAppUpdate } from '@/lib/appUpdate'

export function NotificationBell() {
  const navigate = useNavigate()
  const { data } = useNotifications()
  const { updateAvailable } = useAppUpdate()
  const unread = (data?.unread ?? 0) + (updateAvailable ? 1 : 0)
  return (
    <button
      onClick={() => navigate('/notifications')}
      aria-label="Notifications"
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 transition active:scale-90 active:bg-slate-200/60 dark:active:bg-slate-700"
    >
      <Bell className="h-6 w-6" />
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}
