import { Heart } from 'lucide-react'
import { VERNON_VALUES, VERNON_STAKEHOLDERS } from '@/lib/values'
import { useValuesAck } from '@/hooks/useValuesAck'

// One-time full-screen welcome so every user reads the VernonCorp mission.
// Only the button dismisses it (no backdrop tap) — that's the "definitely read".
export function ValuesWelcome() {
  const { needsAck, ack } = useValuesAck()
  if (!needsAck) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Our mission"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-stone-900/60 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="animate-pop w-full max-w-md overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-600 via-[#7A5AF8] to-[#E879C7] p-6 text-white shadow-card">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/95 text-rose-500 shadow-sm">
          <Heart className="h-6 w-6" fill="currentColor" />
        </div>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">We&apos;re in the business of</p>
        <h2 className="mt-1 font-display text-[2rem] font-semibold leading-[1.05]">Making people happy</h2>

        <p className="mt-4 text-xs font-semibold text-white/75">Who needs to be happy</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {VERNON_STAKEHOLDERS.map((s) => (
            <span key={s} className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">{s}</span>
          ))}
        </div>

        <p className="mt-4 text-sm font-semibold text-white/90">{VERNON_VALUES.slice(1).join('  ·  ')}</p>

        <button
          onClick={ack}
          className="mt-6 w-full rounded-2xl bg-white py-3.5 font-bold text-brand-700 shadow-sm transition active:scale-[0.98]"
        >
          Let&apos;s make people happy
        </button>
      </div>
    </div>
  )
}
