import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { useBoot } from '@/hooks/useData'

// A lighthearted "refreshment" pop: for admin-selected users, at admin-set hours,
// every N minutes their OWN real name-tag photo (Employee Profile.photo — the same
// face on the printed badge, NOT the avatar/user_image) fills ~80% of the screen,
// dancing, with a silly Bahasa one-liner and a synthesized boing. Auto-dismisses.
// Self-gates entirely on boot.settings.prank_enabled (server already checked the
// target list), so it's just mounted once per app like the other overlays.
//
// Motion lives in an injected <style> (the two bundles ship different tailwind
// configs, so component-scoped @keyframes are the only portable animation) and is
// wrapped in prefers-reduced-motion: no-preference — reduced-motion users get a
// static pop, no spinning.

const JOKES = [
  'Ciee yang lagi fokus! Jangan lupa kedip ya 😎',
  'Break dulu — otak butuh piknik 🌴',
  'Senyum dong, gratis kok! 😁',
  'Wajah ini tandanya: kamu keren hari ini ✨',
  'Psst… udah minum air belum? 💧',
  'Regangkan badan, jangan kaku kayak patung 🗿',
  'Kamu lagi dilihatin… sama dirimu sendiri 👀',
  'Semangat! Kopi nggak akan minum dirinya sendiri ☕',
  'Kerja keras boleh, tapi rebahan juga hak asasi 😴',
  'Selamat! Kamu resmi jadi bintang layar 🌟',
  'Jangan tegang, ini cuma kamu kok 🤪',
  'Waktunya tarik napas… buang… ulangi 🌬️',
  'Ganteng/cantik terdeteksi 🚨',
  'Istirahatkan mata 20 detik, lihat yang jauh 👓',
  'Kamu udah hebat sampai sini. Lanjutkan! 💪',
]
const ANIMS = ['prank-spin', 'prank-flip', 'prank-zoom', 'prank-shake']
const KEY = 'prank_last_pop'

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]

// A quick cartoon "boing" via Web Audio — no asset shipped. Browsers block audio
// until the user has interacted with the page at least once; if so this throws and
// we stay silent. That's fine — the animation still plays.
function boing() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    const t0 = ctx.currentTime
    o.frequency.setValueAtTime(180, t0)
    o.frequency.exponentialRampToValueAtTime(520, t0 + 0.12)
    o.frequency.exponentialRampToValueAtTime(240, t0 + 0.34)
    g.gain.setValueAtTime(0.0008, t0)
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.4)
    o.connect(g).connect(ctx.destination)
    o.start(t0)
    o.stop(t0 + 0.42)
    o.onended = () => ctx.close()
  } catch {
    /* audio blocked pre-interaction — silent, animation still runs */
  }
}

// The big face gets a one-shot entrance anim (prank.anim) on the IMG plus a
// never-stopping idle wobble on its WRAPPER — so it keeps dancing the whole time
// it's up, not just on entry. Both are separate elements → transforms don't clash.
const CSS = `
.prank-photo { will-change: transform; }
@media (prefers-reduced-motion: no-preference) {
  .prank-backdrop { animation: prank-fade .2s ease-out both; }
  .prank-idle  { animation: prank-idle 1.8s ease-in-out infinite; }
  .prank-spin  { animation: prank-spin 1.1s cubic-bezier(.5,.1,.3,1) both; }
  .prank-flip  { animation: prank-flip 1s ease-in-out both; }
  .prank-zoom  { animation: prank-zoom .7s cubic-bezier(.22,1.4,.4,1) both; }
  .prank-shake { animation: prank-shake .6s ease-in-out 3 both; }
}
@keyframes prank-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes prank-idle {
  0%,100% { transform: translateY(0) rotate(-3deg) scale(1) }
  50% { transform: translateY(-3%) rotate(3deg) scale(1.04) }
}
@keyframes prank-spin { from { transform: rotate(0) scale(.7) } to { transform: rotate(360deg) scale(1) } }
@keyframes prank-flip {
  0% { transform: perspective(900px) rotateY(0) }
  50% { transform: perspective(900px) rotateY(180deg) scale(1.1) }
  100% { transform: perspective(900px) rotateY(360deg) }
}
@keyframes prank-zoom { 0% { transform: scale(.2) } 60% { transform: scale(1.12) } 100% { transform: scale(1) } }
@keyframes prank-shake {
  0%,100% { transform: translateX(0) rotate(0) }
  20% { transform: translateX(-4%) rotate(-8deg) }
  40% { transform: translateX(4%) rotate(8deg) }
  60% { transform: translateX(-3%) rotate(-5deg) }
  80% { transform: translateX(3%) rotate(5deg) }
}
`

export default function PrankPopup(): JSX.Element | null {
  const { data: boot } = useBoot()
  const s = boot?.settings
  const enabled = s?.prank_enabled === 1
  // The REAL name-tag face (Employee Profile.photo), not the avatar/user_image.
  const photo = boot?.employee?.photo
  const interval = s?.prank_interval_minutes ?? 60
  const startHour = s?.prank_start_hour ?? 9
  const endHour = s?.prank_end_hour ?? 17

  const [pop, setPop] = useState<{ joke: string; anim: string } | null>(null)

  // The ticker: check once a minute whether a pop is due (interval elapsed since the
  // last one, current hour inside the window). localStorage throttles across reloads
  // and tabs so a page refresh can't spam it. No pop while the tab is hidden.
  useEffect(() => {
    if (!enabled || !photo) return
    const tick = () => {
      if (document.hidden) return
      const now = Date.now()
      const last = Number(localStorage.getItem(KEY) || 0)
      if (now - last < interval * 60_000) return
      const h = new Date().getHours()
      const inWindow = startHour <= endHour ? h >= startHour && h <= endHour : h >= startHour || h <= endHour
      if (!inWindow) return
      localStorage.setItem(KEY, String(now))
      setPop({ joke: pick(JOKES), anim: pick(ANIMS) })
      boing()
    }
    const id = window.setInterval(tick, 60_000)
    const kick = window.setTimeout(tick, 4000) // give a fresh open a chance to pop if due
    return () => {
      window.clearInterval(id)
      window.clearTimeout(kick)
    }
  }, [enabled, photo, interval, startHour, endHour])

  // Auto-dismiss ~4.2s; Escape / tap closes early.
  useEffect(() => {
    if (!pop) return
    const t = window.setTimeout(() => setPop(null), 4200)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPop(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [pop])

  if (!pop || !photo) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      onClick={() => setPop(null)}
      // z-[55] — below the blocking gates (z-[60]) so a mandatory modal always wins.
      className="fixed inset-0 z-[55] flex items-center justify-center px-6"
    >
      <style>{CSS}</style>
      <div className="prank-backdrop absolute inset-0 bg-slate-900/70 backdrop-blur-sm" />
      {/* Wrapper wobbles forever; the img plays a one-shot entrance. Face ~80vmin. */}
      <div className="prank-idle relative flex flex-col items-center">
        <img
          src={photo}
          alt=""
          aria-hidden
          className={clsx(
            'prank-photo h-[80vmin] w-[80vmin] max-h-[80vh] max-w-[92vw] rounded-[14%] border-4 border-white/90 object-cover shadow-2xl dark:border-slate-700',
            pop.anim,
          )}
        />
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-[6vh] px-6 text-center text-2xl font-extrabold leading-snug tracking-tight text-white drop-shadow-lg sm:text-3xl">
        {pop.joke}
        <span className="mt-2 block text-sm font-medium text-white/70">Ketuk untuk tutup</span>
      </p>
    </div>,
    document.body,
  )
}
