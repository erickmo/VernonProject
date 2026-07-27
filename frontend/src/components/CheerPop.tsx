import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { useQueryClient } from '@tanstack/react-query'
import { useCheerPop } from '@/hooks/useCheerPop'
import { mobileApi } from '@/lib/api'
import { keys } from '@/hooks/useData'

// A full-screen celebratory overlay that pops when someone cheers or nudges you.
// It renders into a body-level portal (like BulkProgressModal) so `fixed` covers
// the real viewport and sits above the app's z-40 drawers. All the motion lives
// in an injected <style> block below — the two bundles ship different tailwind
// configs, so component-scoped @keyframes are the only portable animation.

// Custom properties can't sit on React.CSSProperties directly; this widens it so
// per-piece `--dur`/`--dx`/… inline vars type-check under strict TS.
type CheerStyle = React.CSSProperties & Record<`--${string}`, string>

// Per-kind flavor. `thanks` = warm party; `buzz` = punchy attention, NOT a party.
const KIND = {
  thanks: {
    hero: '🎉',
    headline: 'Kamu diapresiasi!',
    emojis: ['🎉', '✨', '💛', '🙏'],
    colors: ['#f59e0b', '#fbbf24', '#f472b6', '#fb7185', '#fcd34d', '#fdba74'],
    count: 32,
    gradient: 'from-amber-300 via-pink-300 to-rose-300',
    headlineColor: 'text-rose-600 dark:text-rose-300',
  },
  buzz: {
    hero: '🔔',
    headline: 'Kamu dibutuhkan!',
    emojis: ['⚡', '🔔'],
    colors: ['#6366f1', '#818cf8', '#f59e0b', '#fbbf24'],
    count: 22,
    gradient: 'from-indigo-400 via-indigo-300 to-amber-300',
    headlineColor: 'text-indigo-700 dark:text-indigo-300',
  },
  // Someone gifted you points. Warm gold party, gift-forward.
  gift: {
    hero: '🎁',
    headline: 'Kamu dapat kado!',
    emojis: ['🎁', '✨', '💛', '🙏'],
    colors: ['#f59e0b', '#fbbf24', '#fcd34d', '#fdba74', '#fde68a', '#fb923c'],
    count: 32,
    gradient: 'from-amber-300 via-yellow-200 to-orange-300',
    headlineColor: 'text-amber-600 dark:text-amber-300',
  },
} as const

type PlanState = 'idle' | 'adding' | 'added' | 'kept' | 'cancelling' | 'cancelled' | 'error'

const PLAN_MSG: Record<PlanState, string> = {
  idle: '',
  adding: 'Menambahkan ke rencana hari ini…',
  added: '✓ Ditambahkan ke rencana hari ini',
  kept: 'Sudah ada di rencana hari ini',
  cancelling: 'Membatalkan…',
  cancelled: 'Dibatalkan — tidak ditambahkan',
  error: 'Gagal menambahkan ke rencana',
}

const CSS = `
.cheerpop-piece {
  position: absolute;
  top: -12vh;
  opacity: 0;
  line-height: 1;
  will-change: transform, opacity;
  pointer-events: none;
}
.cheerpop-card { transform: rotate(-1deg); }

@media (prefers-reduced-motion: no-preference) {
  .cheerpop-backdrop { animation: cheerpop-fade 0.25s ease-out both; }
  .cheerpop-card { animation: cheerpop-pop 0.5s cubic-bezier(0.22, 1.4, 0.4, 1) both; }
  .cheerpop-piece { animation: cheerpop-fall var(--dur, 3s) linear var(--delay, 0s) infinite; }
}

@keyframes cheerpop-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes cheerpop-pop {
  0%   { opacity: 0; transform: scale(0.6) rotate(-8deg); }
  55%  { opacity: 1; transform: scale(1.06) rotate(2deg); }
  75%  { transform: scale(0.97) rotate(-1.5deg); }
  100% { transform: scale(1) rotate(-1deg); }
}
@keyframes cheerpop-fall {
  0%   { transform: translate3d(0, 0, 0) rotate(var(--r0, 0deg)); opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { transform: translate3d(var(--dx, 0px), 122vh, 0) rotate(var(--r1, 360deg)); opacity: 0; }
}
`

export default function CheerPop(): JSX.Element | null {
  const { cheer, dismiss } = useCheerPop()
  const qc = useQueryClient()

  // A buzz that references a Project Todo auto-adds it to the recipient's plan for
  // today (the default), leaving a Batalkan to undo. planPrev holds the pre-add
  // minutes so the undo restores exactly. Keyed by cheer.name; the ref guards
  // against firing the write twice (StrictMode double-mount / re-render).
  const [plan, setPlan] = useState<PlanState>('idle')
  const planPrev = useRef(0)
  const autoAdded = useRef<string | null>(null)
  const buzzTodo = cheer && cheer.kind === 'buzz' ? cheer.todo : null

  useEffect(() => {
    setPlan('idle')
    if (!buzzTodo || !cheer) return
    if (autoAdded.current === cheer.name) return
    autoAdded.current = cheer.name
    setPlan('adding')
    mobileApi
      .planToday(buzzTodo)
      .then((r) => {
        planPrev.current = r.prev_minutes
        setPlan(r.changed ? 'added' : 'kept')
        qc.invalidateQueries({ queryKey: keys.dashboard })
      })
      .catch(() => setPlan('error'))
  }, [cheer?.name, buzzTodo, qc])

  const undoPlan = () => {
    if (!buzzTodo) return
    setPlan('cancelling')
    mobileApi
      .planToday(buzzTodo, planPrev.current)
      .then(() => {
        setPlan('cancelled')
        qc.invalidateQueries({ queryKey: keys.dashboard })
      })
      .catch(() => setPlan('error'))
  }

  // Confetti is randomized once per cheer (keyed on name) — not on every render.
  const pieces = useMemo(() => {
    if (!cheer) return []
    const cfg = KIND[cheer.kind]
    return Array.from({ length: cfg.count }, (_, id) => {
      const emoji = Math.random() < 0.55 ? cfg.emojis[Math.floor(Math.random() * cfg.emojis.length)] : null
      const size = 10 + Math.random() * 16
      return {
        id,
        emoji,
        color: cfg.colors[Math.floor(Math.random() * cfg.colors.length)],
        size,
        left: Math.random() * 100,
        delay: Math.random() * 2.2,
        dur: 2.4 + Math.random() * 1.6,
        drift: Math.round(Math.random() * 160 - 80),
        r0: Math.round(Math.random() * 360),
        r1: Math.round((360 + Math.random() * 540) * (Math.random() < 0.5 ? -1 : 1)),
      }
    })
  }, [cheer?.name, cheer?.kind])

  // Escape always closes. Auto-dismiss ~4.5s EXCEPT a buzz that put a todo on your
  // plan — that one stays up so you can read it and Batalkan before it closes.
  // Re-armed whenever the cheer changes; torn down on unmount / before the next cheer.
  useEffect(() => {
    if (!cheer) return
    const timer = buzzTodo ? undefined : window.setTimeout(dismiss, 4500)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      if (timer) window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [cheer?.name, buzzTodo, dismiss])

  if (!cheer) return null

  const cfg = KIND[cheer.kind]
  const sub =
    cheer.kind === 'thanks'
      ? cheer.title
      : cheer.kind === 'gift'
        ? cheer.body // "{sender} memberi kamu {n} poin."
        : `${cheer.from} lagi nungguin kamu`
  const detail = cheer.kind === 'buzz' ? cheer.body : ''

  return createPortal(
    // Tapping anywhere (backdrop or card) closes it; confetti is pointer-events-none.
    <div
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      onClick={dismiss}
      className="fixed inset-0 z-[60] flex items-center justify-center px-6"
    >
      <style>{CSS}</style>
      <div className="cheerpop-backdrop absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />

      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p) => (
          <span
            key={p.id}
            aria-hidden
            className="cheerpop-piece"
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
              } as CheerStyle
            }
          >
            {p.emoji}
          </span>
        ))}
      </div>

      <div key={cheer.name} className="cheerpop-card relative w-full max-w-xs">
        <div className={clsx('rounded-[28px] bg-gradient-to-br p-[3px] shadow-2xl', cfg.gradient)}>
          <div className="rounded-[26px] bg-white/95 px-7 py-8 text-center backdrop-blur dark:bg-slate-900/95">
            <div className="text-6xl">{cfg.hero}</div>
            <h2 className={clsx('mt-3 text-2xl font-extrabold tracking-tight', cfg.headlineColor)}>{cfg.headline}</h2>
            <p className="mt-2 text-base font-semibold text-stone-700 dark:text-slate-200">{sub}</p>
            {detail && <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">{detail}</p>}
            <div className="mt-4 flex justify-center gap-1 text-lg" aria-hidden>
              {cfg.emojis.map((e, i) => (
                <span key={i}>{e}</span>
              ))}
            </div>

            {buzzTodo && (
              // Stop clicks bubbling to the backdrop (which dismisses); the buttons
              // close explicitly. The plan was already added on open — this is undo.
              <div className="mt-5" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                  {PLAN_MSG[plan]}
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  {plan === 'added' && (
                    <button
                      type="button"
                      onClick={undoPlan}
                      className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-semibold text-stone-600 hover:bg-stone-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Batalkan
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={dismiss}
                    className="rounded-full bg-indigo-600 px-5 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
