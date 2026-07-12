import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import type { BannerSlide } from '@/lib/types'

// Full-bleed promo banner strip at the very top of the home screen. Images are
// managed in Settings → Home Banners. Native scroll-snap track: drag/swipe to
// slide manually, auto-advances every 5s (paused while touched). Tap follows
// the banner's link (in-app route when it starts with "/", else opens the URL).
export function BannerCarousel({ slides }: { slides: BannerSlide[] }) {
  const navigate = useNavigate()
  const trackRef = useRef<HTMLDivElement>(null)
  const held = useRef(false)
  const [idx, setIdx] = useState(0)
  const n = slides.length

  const onScroll = () => {
    const el = trackRef.current
    if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth))
  }

  useEffect(() => {
    if (n <= 1) return
    const t = setInterval(() => {
      const el = trackRef.current
      if (!el || held.current) return // don't fight the user mid-drag
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % n
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    }, 5000)
    return () => clearInterval(t)
  }, [n])

  if (!n) return null

  const go = (link: string) => {
    if (!link) return
    if (link.startsWith('/')) navigate(link)
    else window.open(link, '_blank', 'noopener')
  }

  return (
    // -mx-4 cancels TabScreen's px-4 so the strip bleeds edge to edge.
    <div className="relative -mx-4">
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={() => (held.current = true)}
        onPointerUp={() => (held.current = false)}
        onPointerCancel={() => (held.current = false)}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s, k) => (
          <button
            key={s.image + k}
            onClick={() => go(s.link)}
            disabled={!s.link}
            className="relative block aspect-[16/7] w-full shrink-0 snap-center overflow-hidden bg-paper-line dark:bg-slate-800"
          >
            <img src={s.image} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {n > 1 && (
        <div className="pointer-events-none absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5">
          {slides.map((sl, k) => (
            <span
              key={sl.image + k}
              className={clsx('h-1.5 rounded-full transition-all', k === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/55')}
            />
          ))}
        </div>
      )}
    </div>
  )
}
