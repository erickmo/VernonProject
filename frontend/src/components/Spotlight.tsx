import { useEffect, useState } from 'react'
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

// Rotating promo hero (Gojek-style banner). Auto-advances every 5s through the
// slides it's given; dots + tap. Purely presentational — callers build slides
// from data they already hold, so this makes no API calls of its own.
export function Spotlight({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0)
  const n = slides.length
  const idx = n ? i % n : 0

  useEffect(() => {
    if (n <= 1) return
    const t = setInterval(() => setI((v) => (v + 1) % n), 5000)
    return () => clearInterval(t)
  }, [n])

  if (!n) return null
  const s = slides[idx]
  const Icon = s.icon

  return (
    <button
      onClick={s.onAct}
      className={clsx(
        'relative flex min-h-[104px] w-full items-center gap-4 overflow-hidden rounded-[26px] bg-gradient-to-br p-5 text-left text-white shadow-card transition active:scale-[0.99]',
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

      {n > 1 && (
        <div className="absolute bottom-3 right-5 z-10 flex gap-1.5">
          {slides.map((sl, k) => (
            <span key={sl.id} className={clsx('h-1.5 rounded-full transition-all', k === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/45')} />
          ))}
        </div>
      )}
    </button>
  )
}
