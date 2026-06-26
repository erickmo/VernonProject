import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import clsx from 'clsx'
import { BottomNav } from './BottomNav'

// Page shell with bottom navigation (top-level tabs).
export function TabScreen({
  title,
  subtitle,
  right,
  children,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {right}
        </div>
      </header>
      <main className="flex-1 px-4 pb-28">{children}</main>
      <BottomNav />
    </div>
  )
}

// Page shell for detail screens (back button, no bottom nav).
export function DetailScreen({
  title,
  children,
  right,
}: {
  title: string
  children: React.ReactNode
  right?: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 transition active:scale-90 active:bg-slate-100 dark:active:bg-slate-700"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="flex-1 truncate text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h1>
        {right && <div className="pr-1">{right}</div>}
      </header>
      <main className="flex-1 px-4 pb-20 pt-5">{children}</main>
    </div>
  )
}

// Lightweight pull-to-refresh for touch devices. Falls back gracefully.
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown> | void
  children: React.ReactNode
}) {
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0 && !refreshing) startY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0) setPull(Math.min(delta * 0.4, 70))
  }
  const onTouchEnd = async () => {
    if (pull > 50) {
      setRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
      }
    }
    setPull(0)
    startY.current = null
  }

  useEffect(() => {
    if (!refreshing) setPull(0)
  }, [refreshing])

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        style={{ height: refreshing ? 36 : pull }}
        className="flex items-center justify-center overflow-hidden text-slate-400 dark:text-slate-500 transition-[height] duration-150"
      >
        {(pull > 10 || refreshing) && (
          <div
            className={clsx('h-5 w-5 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-brand-500', {
              'animate-spin': refreshing,
            })}
            style={!refreshing ? { transform: `rotate(${pull * 4}deg)` } : undefined}
          />
        )}
      </div>
      {children}
    </div>
  )
}
