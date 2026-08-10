import { useEffect, useLayoutEffect, useRef } from 'react'
import { Megaphone, ExternalLink } from 'lucide-react'
import { useActiveAnnouncements } from '@/hooks/useData'
import type { ActiveAnnouncement } from '@/lib/types'

// Shared top-of-page ticker for BOTH frontends (/m and /w). A thin brand bar,
// fixed to the very top, non-dismissible, rendering every active announcement in
// one continuous marquee. Empty → renders nothing.
//
// It pins via a measured CSS var: the bar sets `--tk-h` to its real height
// (safe-area included) on :root; each frontend's index.css pads <body> by that
// var and offsets its sticky header's `top` by it, so nothing hides behind it.

function Segment({ a }: { a: ActiveAnnouncement }) {
  const text = <span className="px-1 font-medium">{a.message}</span>
  return (
    <span className="inline-flex items-center">
      {a.link ? (
        <a
          href={a.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:underline"
        >
          {text}
          <ExternalLink className="h-3.5 w-3.5 opacity-80" />
        </a>
      ) : (
        text
      )}
      <span aria-hidden className="px-4 opacity-50">•</span>
    </span>
  )
}

export function AnnouncementTicker() {
  const { data } = useActiveAnnouncements()
  const items = data ?? []
  const barRef = useRef<HTMLDivElement>(null)

  // Publish the bar's real height so body padding + sticky headers offset by it.
  useLayoutEffect(() => {
    const el = barRef.current
    const root = document.documentElement
    if (!el || !items.length) {
      root.style.setProperty('--tk-h', '0px')
      return
    }
    const ro = new ResizeObserver(() =>
      root.style.setProperty('--tk-h', `${el.offsetHeight}px`),
    )
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.setProperty('--tk-h', '0px')
    }
  }, [items.length])

  if (!items.length) return null

  // One marquee copy = every active message; rendered twice so translateX(-50%)
  // loops seamlessly. Speed is constant: duration scales with total text length.
  const chars = items.reduce((n, a) => n + a.message.length + 3, 0)
  const duration = `${Math.max(18, Math.round(chars * 0.22))}s`
  const copy = (
    <span className="flex shrink-0 items-center px-2">
      {items.map((a) => (
        <Segment key={a.name} a={a} />
      ))}
    </span>
  )

  return (
    <div
      ref={barRef}
      role="status"
      aria-label="Announcements"
      className="fixed inset-x-0 top-0 z-40 flex items-center gap-1 bg-brand-600 text-white shadow-sm pt-[env(safe-area-inset-top)]"
    >
      <Megaphone className="ml-3 h-4 w-4 shrink-0" aria-hidden />
      <div className="tk-track relative flex-1 overflow-hidden py-1.5 text-sm">
        <div className="tk-marquee flex w-max whitespace-nowrap will-change-transform" style={{ animationDuration: duration }}>
          {copy}
          <span aria-hidden>{copy}</span>
        </div>
      </div>
    </div>
  )
}
