import { createPortal } from 'react-dom'
import { Heart } from 'lucide-react'
import { VERNON_VALUES, VERNON_STAKEHOLDERS } from '@/lib/values'
import { useValuesAck } from '@/hooks/useValuesAck'

// One-time welcome modal so every user reads the VernonCorp mission before the
// dashboard. Only the button dismisses it (no backdrop click) — "definitely read".
export function ValuesWelcome() {
  const { needsAck, ack } = useValuesAck()
  if (!needsAck) return null
  // Portal to <body>: it renders inside Page, whose animate-rise leaves
  // transform:translateY(0) (fill-mode:both) — a containing block that would
  // otherwise pin this `fixed` overlay to the Page box, not the viewport.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Our mission"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 p-8 text-center text-white shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/95 text-rose-500 shadow-lg">
          <Heart className="h-7 w-7" fill="currentColor" />
        </div>
        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">We&apos;re in the business of</p>
        <h2 className="mt-1 font-display text-4xl font-semibold">Making people happy</h2>
        <p className="mt-5 text-xs font-semibold text-white/75">Who needs to be happy</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {VERNON_STAKEHOLDERS.map((s) => (
            <span key={s} className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold backdrop-blur-sm">{s}</span>
          ))}
        </div>
        <p className="mt-5 text-base font-semibold text-white/90">{VERNON_VALUES.slice(1).join('  ·  ')}</p>
        <button
          onClick={ack}
          className="mt-7 rounded-xl bg-white px-6 py-3 font-semibold text-brand-700 shadow-lg transition hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Let&apos;s make people happy
        </button>
      </div>
    </div>,
    document.body,
  )
}
