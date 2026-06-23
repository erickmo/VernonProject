import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { useNotifications, useMarkRead, useMarkAllRead } from '@/hooks/useData'
import type { AppNotification } from '@/lib/types'

const ANIM_MS = 260

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

  const [shown, setShown] = useState(false) // drives the enter/exit slide
  const [drag, setDrag] = useState(0) // px the sheet is pulled down (>= 0)
  const dragging = useRef(false)
  const startY = useRef<number | null>(null)
  const closed = useRef(false)

  // Enter on mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Animate out, then unmount.
  const close = () => {
    if (closed.current) return
    closed.current = true
    setShown(false)
    setDrag(0)
    setTimeout(onClose, ANIM_MS)
  }

  const open = (n: AppNotification) => {
    if (!n.is_read) markRead.mutate(n.name)
    onClose()
    navigate(deepLink(n))
  }

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    dragging.current = true
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || startY.current === null) return
    setDrag(Math.max(0, e.touches[0].clientY - startY.current))
  }
  const onTouchEnd = () => {
    dragging.current = false
    startY.current = null
    if (drag > 110) close()
    else setDrag(0)
  }

  const sheetStyle: React.CSSProperties = {
    transform: shown ? `translateY(${drag}px)` : 'translateY(100%)',
    transition: dragging.current ? 'none' : `transform ${ANIM_MS}ms cubic-bezier(0.32,0.72,0,1)`,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-[260ms]"
        style={{ opacity: shown ? 1 : 0 }}
        onClick={close}
      />
      <div
        className="relative mx-auto flex max-h-[80vh] w-full max-w-md flex-col rounded-t-[28px] bg-white dark:bg-slate-800 shadow-2xl will-change-transform"
        style={sheetStyle}
      >
        {/* Grabber + header — drag handle area */}
        <div
          className="shrink-0 cursor-grab touch-none px-5 pt-3 active:cursor-grabbing"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Notifications</h2>
            <button
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending || (data?.unread ?? 0) === 0}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-200 disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
        </div>
        <div className="-mx-1 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6 text-slate-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-slate-400 dark:text-slate-500">
              <Bell className="h-8 w-8" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {items.map((n) => (
                <li key={n.name}>
                  <button
                    onClick={() => open(n)}
                    className="flex w-full items-start gap-3 px-1 py-3 text-left active:bg-slate-50 dark:active:bg-slate-700/50"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.is_read ? 'bg-transparent' : 'bg-brand-500'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block truncate text-sm text-slate-500 dark:text-slate-400">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">
                        {n.at_human}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
