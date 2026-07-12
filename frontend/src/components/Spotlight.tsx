import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronRight, type LucideIcon } from 'lucide-react'

export type Slide = {
  id: string
  eyebrow: string
  title: string
  sub?: string
  cta: string
  icon: LucideIcon
  gradient: string // tailwind `from-… via-… to-…` classes for the banner bg
  onAct: () => void
}

// Rotating promo hero (Gojek-style banner). Native scroll-snap track: drag/swipe
// to slide manually, auto-advances every 5s (paused while touched); dots + tap.
// Purely presentational — callers build slides from data they already hold.
export function Spotlight({ slides }: { slides: Slide[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const held = useRef(false)
  const startX = useRef(0)
  const dragX = useRef(0) // px moved since pointerdown; suppresses tap after a swipe
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

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={(e) => { held.current = true; startX.current = e.clientX; dragX.current = 0 }}
        onPointerMove={(e) => { if (held.current) dragX.current = e.clientX - startX.current }}
        onPointerUp={() => (held.current = false)}
        onPointerCancel={() => (held.current = false)}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.id}
              onClick={() => { if (Math.abs(dragX.current) < 10) s.onAct() }}
              className={clsx(
                'relative flex min-h-[104px] w-full shrink-0 snap-start items-center gap-4 overflow-hidden rounded-[26px] bg-gradient-to-br p-5 text-left text-white shadow-card transition active:scale-[0.99]',
                s.gradient,
              )}
            >
              {/* washi-tape + paper-dot + confetti motif, matching the day card */}
              <div aria-hidden className="pointer-events-none absolute -left-6 top-3 h-7 w-28 -rotate-[18deg] bg-white/25" />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.16) 1px, transparent 1.4px)', backgroundSize: '15px 15px' }}
              />
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <span className="absolute left-[24%] top-3 h-2 w-2 rotate-12 rounded-[2px] bg-amber-300" />
                <span className="absolute right-[36%] bottom-4 h-2 w-2 rotate-45 rounded-[2px] bg-white/70" />
              </div>

              <div className="relative z-10 min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">{s.eyebrow}</p>
                <p className="mt-0.5 font-display text-xl font-semibold leading-tight">{s.title}</p>
                {s.sub && <p className="mt-0.5 text-xs font-semibold text-white/85">{s.sub}</p>}
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
                  {s.cta} <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>

              {/* floating icon sticker on the right, where Gojek puts the photo */}
              <Icon aria-hidden strokeWidth={1.75} className="relative z-10 h-16 w-16 shrink-0 animate-float text-white/90" />
            </button>
          )
        })}
      </div>

      {n > 1 && (
        <div className="pointer-events-none absolute bottom-3 right-5 z-10 flex gap-1.5">
          {slides.map((sl, k) => (
            <span key={sl.id} className={clsx('h-1.5 rounded-full transition-all', k === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/45')} />
          ))}
        </div>
      )}
    </div>
  )
}
