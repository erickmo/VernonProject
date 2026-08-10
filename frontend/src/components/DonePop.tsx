import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

// A brief, NON-blocking confetti burst that fires when a task is marked done (or
// its final approval lands). Driven by a `token` counter: each increment restarts
// the burst. Renders into a body-level portal so `fixed` covers the real viewport
// and sits above the app's drawers/modals; `pointer-events-none` means it never
// eats a tap. All motion lives in the injected <style> — the two bundles ship
// different tailwind configs, so component-scoped @keyframes are the only portable
// animation (same reason as CheerPop). Auto-clears after ~2s; a single fall, not a
// loop. Respects prefers-reduced-motion: the badge still shows, confetti stays put.

type PieceStyle = React.CSSProperties & Record<`--${string}`, string>

const COLORS = ['#6366f1', '#818cf8', '#f59e0b', '#fbbf24', '#f472b6', '#34d399', '#fb7185']
const EMOJIS = ['🎉', '✨', '✅', '💛']

const CSS = `
.donepop-piece {
  position: absolute;
  top: -10vh;
  opacity: 0;
  line-height: 1;
  will-change: transform, opacity;
}
@media (prefers-reduced-motion: no-preference) {
  .donepop-piece { animation: donepop-fall var(--dur, 2s) linear var(--delay, 0s) forwards; }
  .donepop-badge { animation: donepop-pop 0.45s cubic-bezier(0.22, 1.4, 0.4, 1) both; }
}
@keyframes donepop-fall {
  0%   { transform: translate3d(0, 0, 0) rotate(var(--r0, 0deg)); opacity: 0; }
  12%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { transform: translate3d(var(--dx, 0px), 115vh, 0) rotate(var(--r1, 360deg)); opacity: 0; }
}
@keyframes donepop-pop {
  0%   { opacity: 0; transform: scale(0.6) translateY(6px); }
  60%  { opacity: 1; transform: scale(1.06) translateY(0); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
`

export default function DonePop({ token }: { token: number }): JSX.Element | null {
  // `shown` holds the token currently celebrating; 0 = nothing on screen.
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (!token) return
    setShown(token)
    const timer = window.setTimeout(() => setShown(0), 2000)
    return () => window.clearTimeout(timer)
  }, [token])

  // Randomized once per burst (keyed on the shown token), not per render.
  const pieces = useMemo(() => {
    if (!shown) return []
    return Array.from({ length: 26 }, (_, id) => {
      const emoji = Math.random() < 0.5 ? EMOJIS[Math.floor(Math.random() * EMOJIS.length)] : null
      const size = 10 + Math.random() * 16
      return {
        id,
        emoji,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 1.6 + Math.random() * 0.9,
        drift: Math.round(Math.random() * 160 - 80),
        r0: Math.round(Math.random() * 360),
        r1: Math.round((360 + Math.random() * 540) * (Math.random() < 0.5 ? -1 : 1)),
      }
    })
  }, [shown])

  if (!shown) return null

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      <style>{CSS}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="donepop-piece"
          style={
            {
              left: `${p.left}%`,
              '--dur': `${p.dur}s`,
              '--delay': `${p.delay}s`,
              '--dx': `${p.drift}px`,
              '--r0': `${p.r0}deg`,
              '--r1': `${p.r1}deg`,
              ...(p.emoji
                ? { fontSize: `${p.size}px` }
                : {
                    width: `${p.size * 0.5}px`,
                    height: `${p.size * 0.85}px`,
                    background: p.color,
                    borderRadius: '3px',
                  }),
            } as PieceStyle
          }
        >
          {p.emoji}
        </span>
      ))}
      <div className="absolute inset-x-0 top-[22%] flex justify-center">
        <div
          role="status"
          aria-live="polite"
          className="donepop-badge rounded-full bg-white/95 px-5 py-2 text-base font-extrabold text-brand-600 shadow-xl backdrop-blur dark:bg-slate-900/95 dark:text-brand-300"
        >
          Selesai! 🎉
        </div>
      </div>
    </div>,
    document.body,
  )
}
