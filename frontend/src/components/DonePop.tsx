import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

// A brief, NON-blocking celebration that fires when a task is marked done (or its
// final approval lands). Driven by a `token` counter: each increment restarts it.
// Two layers: a radial firework BURST that shoots outward from center, plus a
// gentle confetti FALL raining down. Renders into a body-level portal so `fixed`
// covers the real viewport and sits above the app's drawers/modals;
// `pointer-events-none` means it never eats a tap. All motion lives in the injected
// <style> — the two bundles ship different tailwind configs, so component-scoped
// @keyframes are the only portable animation (same reason as CheerPop). Auto-clears
// after ~2s. Respects prefers-reduced-motion: the badge still shows, nothing flies.

type PieceStyle = React.CSSProperties & Record<`--${string}`, string>

const COLORS = ['#6366f1', '#818cf8', '#a855f7', '#f59e0b', '#fbbf24', '#f472b6', '#fb7185', '#34d399', '#22d3ee']
const EMOJIS = ['🎉', '🎊', '✨', '🌟', '✅', '💛', '🥳', '🎈']

const CSS = `
.donepop-piece {
  position: absolute;
  top: -10vh;
  opacity: 0;
  line-height: 1;
  will-change: transform, opacity;
}
.donepop-spark {
  position: absolute;
  left: 50%;
  top: 24%;
  opacity: 0;
  line-height: 1;
  will-change: transform, opacity;
}
@media (prefers-reduced-motion: no-preference) {
  .donepop-piece { animation: donepop-fall var(--dur, 2s) linear var(--delay, 0s) forwards; }
  .donepop-spark { animation: donepop-burst var(--dur, 0.9s) cubic-bezier(0.15, 0.7, 0.3, 1) var(--delay, 0s) forwards; }
  .donepop-badge { animation: donepop-pop 0.55s cubic-bezier(0.22, 1.7, 0.4, 1) both; }
}
@keyframes donepop-fall {
  0%   { transform: translate3d(0, 0, 0) rotate(var(--r0, 0deg)); opacity: 0; }
  12%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { transform: translate3d(var(--dx, 0px), 115vh, 0) rotate(var(--r1, 360deg)); opacity: 0; }
}
@keyframes donepop-burst {
  0%   { transform: translate3d(-50%, -50%, 0) scale(0.2) rotate(0deg); opacity: 0; }
  15%  { opacity: 1; }
  100% { transform: translate3d(calc(-50% + var(--bx, 0px)), calc(-50% + var(--by, 0px)), 0) scale(1) rotate(var(--r1, 200deg)); opacity: 0; }
}
@keyframes donepop-pop {
  0%   { opacity: 0; transform: scale(0.6) translateY(6px) rotate(-4deg); }
  55%  { opacity: 1; transform: scale(1.12) translateY(0) rotate(3deg); }
  100% { opacity: 1; transform: scale(1) translateY(0) rotate(0deg); }
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
    return Array.from({ length: 40 }, (_, id) => {
      const emoji = Math.random() < 0.6 ? EMOJIS[Math.floor(Math.random() * EMOJIS.length)] : null
      const size = 10 + Math.random() * 18
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

  // Radial firework: sparks fan out evenly from the badge center.
  const sparks = useMemo(() => {
    if (!shown) return []
    const N = 22
    return Array.from({ length: N }, (_, id) => {
      const angle = (id / N) * Math.PI * 2 + Math.random() * 0.3
      const radius = 120 + Math.random() * 130
      const emoji = Math.random() < 0.45 ? EMOJIS[Math.floor(Math.random() * EMOJIS.length)] : null
      return {
        id,
        emoji,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 8 + Math.random() * 12,
        bx: Math.round(Math.cos(angle) * radius),
        by: Math.round(Math.sin(angle) * radius),
        delay: Math.random() * 0.12,
        dur: 0.75 + Math.random() * 0.5,
        r1: Math.round(Math.random() * 360 - 180),
      }
    })
  }, [shown])

  if (!shown) return null

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      <style>{CSS}</style>
      {sparks.map((s) => (
        <span
          key={`s${s.id}`}
          className="donepop-spark"
          style={
            {
              '--bx': `${s.bx}px`,
              '--by': `${s.by}px`,
              '--delay': `${s.delay}s`,
              '--dur': `${s.dur}s`,
              '--r1': `${s.r1}deg`,
              ...(s.emoji
                ? { fontSize: `${s.size}px` }
                : {
                    width: `${s.size * 0.55}px`,
                    height: `${s.size * 0.55}px`,
                    background: s.color,
                    borderRadius: '9999px',
                  }),
            } as PieceStyle
          }
        >
          {s.emoji}
        </span>
      ))}
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
