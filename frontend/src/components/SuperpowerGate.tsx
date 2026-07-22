import { Sparkles, ArrowRight } from 'lucide-react'
import { Avatar } from './ui'
import { useBoot } from '../hooks/useData'

// Blocking onboarding gate: shown on app open when Vernon Settings
// force_superpower_onboarding is on and the user has claimed no superpowers yet.
// The only way out is the CTA → the superpowers page. Mounted by both App.tsx.
// Gate visibility is decided by the caller; this component is pure presentation.

// Floating superpower emblems orbiting the avatar — hype, no asset needed.
const ORBIT = [
  { e: '⚡', cls: 'left-2 top-4', d: '0s' },
  { e: '🔥', cls: 'right-3 top-8', d: '0.4s' },
  { e: '🚀', cls: 'left-6 bottom-6', d: '0.8s' },
  { e: '💪', cls: 'right-5 bottom-4', d: '1.2s' },
  { e: '🎯', cls: 'left-0 top-1/2', d: '1.6s' },
  { e: '🧠', cls: 'right-0 top-1/2', d: '0.6s' },
]

export default function SuperpowerGate({ onGo }: { onGo: () => void }) {
  const boot = useBoot().data

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-brand-600 via-brand-500 to-indigo-700 px-8 text-center animate-fade-in">
      {/* soft glow blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />

      {/* animated hero: avatar ringed by floating superpower emblems */}
      <div className="relative mb-8 flex h-56 w-56 items-center justify-center animate-pop">
        <div className="absolute inset-6 rounded-full bg-white/25 blur-xl animate-float" />
        <div className="rounded-full ring-4 ring-white/70 shadow-2xl">
          <Avatar name={boot?.full_name || ''} config={boot?.avatar_config} size={128} />
        </div>
        {ORBIT.map((o) => (
          <span
            key={o.e}
            className={`absolute ${o.cls} text-3xl drop-shadow-lg animate-float`}
            style={{ animationDelay: o.d }}
          >
            {o.e}
          </span>
        ))}
      </div>

      <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
        <Sparkles className="h-3.5 w-3.5" /> Baru
      </div>

      <h1 className="mt-4 max-w-sm text-3xl font-extrabold leading-tight text-white drop-shadow">
        ⚡ Waktunya pilih Superpower-mu!
      </h1>
      <p className="mt-3 max-w-sm leading-relaxed text-white/90">
        Setiap orang punya kekuatan unik. Pilih superpower yang paling menggambarkan dirimu —
        biar rekan kerja mengenali kelebihanmu, memberi nilai, dan kamu naik level serta
        kumpulkan badge dari kontribusimu. Yuk mulai sekarang!
      </p>

      <button
        onClick={onGo}
        className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-lg font-bold text-brand-700 shadow-xl transition-transform active:scale-95 hover:scale-[1.03]"
      >
        Pilih Superpower-ku
        <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  )
}
