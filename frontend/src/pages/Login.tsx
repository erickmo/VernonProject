import { useEffect, useState } from 'react'
import { Eye, EyeOff, ArrowRight, AlertCircle, Sparkles, Star, Zap, Fingerprint, Heart } from 'lucide-react'
import { login } from '@/lib/api'
import { VERNON_VALUES, VERNON_STAKEHOLDERS } from '@/lib/values'
import { Spinner } from '@/components/ui'
import { loginWithPasskey, platformAuthenticatorAvailable, isPasskeyCancel, describePasskeyError } from '@/lib/webauthn'

// In-app login (does NOT use the Frappe desk login page). Posts to
// /api/method/login and hard-reloads into /m on success.
//
// Layout: one playful soft-pop gradient hero (casual greeting, confetti specks,
// floating sticker) over the warm paper canvas, with a relaxed form card below.
// Less "corporate bento mosaic", more "hey, welcome back". Entrance is a short
// staggered rise; scoped <style> honors prefers-reduced-motion.
export default function Login() {
  const [usr, setUsr] = useState('')
  const [pwd, setPwd] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pkAvailable, setPkAvailable] = useState(false)
  const [pkLoading, setPkLoading] = useState(false)

  useEffect(() => {
    platformAuthenticatorAvailable().then(setPkAvailable)
  }, [])

  const passkeySignIn = async () => {
    if (pkLoading || loading) return
    setPkLoading(true)
    setError(null)
    try {
      await loginWithPasskey()
      window.location.href = '/m'
    } catch (err) {
      if (!isPasskeyCancel(err)) setError('Passkey — ' + describePasskeyError(err))
      setPkLoading(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!usr || !pwd || loading) return
    setLoading(true)
    setError(null)
    try {
      await login(usr.trim(), pwd)
      // Reload so the SPA boots with a fresh session + csrf token.
      window.location.href = '/m'
    } catch (err) {
      setError((err as Error).message || 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <style>{vnlCss}</style>

      <div className="flex flex-1 flex-col justify-center gap-4">
        {/* Playful hero — one friendly gradient card, not a grid of color blocks */}
        <div
          className="vnl-rise relative overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-600 via-[#7A5AF8] to-[#E879C7] px-6 py-8 text-white shadow-card"
          style={{ animationDelay: '40ms' }}
        >
          {/* washi-tape strip */}
          <div aria-hidden className="pointer-events-none absolute -left-7 top-5 h-8 w-32 -rotate-[18deg] bg-white/25" />
          {/* confetti specks */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <span className="absolute left-[18%] top-5 h-2.5 w-2.5 rotate-12 rounded-[3px] bg-amber-300 animate-float" />
            <span className="absolute right-[12%] top-9 h-3 w-3 rounded-full bg-sky-300/90" />
            <span className="absolute right-[26%] bottom-6 h-2 w-2 rotate-45 rounded-[2px] bg-emerald-300" />
            <span className="absolute left-[46%] bottom-5 h-1.5 w-1.5 rounded-full bg-white/80 animate-float" />
          </div>
          {/* paper dot motif */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.16) 1px, transparent 1.4px)', backgroundSize: '15px 15px' }}
          />
          {/* floating icon stickers — staggered float for organic, lively motion */}
          <Sparkles aria-hidden strokeWidth={2.25} className="pointer-events-none absolute right-4 top-4 h-7 w-7 animate-float text-amber-200" />
          <Star aria-hidden fill="currentColor" className="pointer-events-none absolute right-14 bottom-6 h-4 w-4 animate-float text-white/80" style={{ animationDelay: '0.6s' }} />
          <Zap aria-hidden fill="currentColor" className="pointer-events-none absolute left-5 bottom-8 h-5 w-5 animate-float text-sky-200" style={{ animationDelay: '1.1s' }} />

          <div className="relative z-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/95 text-rose-500 shadow-sm">
              <Heart className="h-6 w-6" fill="currentColor" />
            </div>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">We&apos;re in the business of</p>
            <h1 className="mt-1 font-display text-[2.1rem] font-semibold leading-[1.05]">Making people happy</h1>

            {/* Who needs to be happy */}
            <p className="mt-4 text-xs font-semibold text-white/75">Who needs to be happy</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {VERNON_STAKEHOLDERS.map((s) => (
                <span key={s} className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">{s}</span>
              ))}
            </div>

            {/* Supporting values */}
            <p className="mt-4 text-sm font-semibold text-white/90">{VERNON_VALUES.slice(1).join('  ·  ')}</p>
          </div>
        </div>

        {/* Form — paper card */}
        <form
          onSubmit={submit}
          className="vnl-rise rounded-[26px] border border-paper-edge bg-paper-card p-6 shadow-card dark:border-slate-800 dark:bg-slate-900"
          style={{ animationDelay: '130ms' }}
        >
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <label className="mb-1.5 block text-sm font-semibold text-stone-600 dark:text-slate-300">Email</label>
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            value={usr}
            onChange={(e) => setUsr(e.target.value)}
            placeholder="you@vernon.id"
            className="mb-4 w-full rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper dark:bg-slate-800 px-4 py-3 text-[16px] text-stone-800 dark:text-slate-100 outline-none transition focus:border-brand-400 focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-brand-100 dark:placeholder-slate-500"
          />

          <label className="mb-1.5 block text-sm font-semibold text-stone-600 dark:text-slate-300">Password</label>
          <div className="relative mb-5">
            <input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper dark:bg-slate-800 px-4 py-3 pr-12 text-[16px] text-stone-800 dark:text-slate-100 outline-none transition focus:border-brand-400 focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-brand-100 dark:placeholder-slate-500"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-slate-500"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || !usr || !pwd}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-bold text-white shadow-sm transition active:scale-[0.98] active:bg-brand-700 disabled:opacity-50"
          >
            {loading ? (
              <Spinner className="h-5 w-5" />
            ) : (
              <>
                Let&apos;s go <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>

          {pkAvailable && (
            <>
              <div className="my-4 flex items-center gap-3 text-xs font-semibold text-stone-300 dark:text-slate-600">
                <span className="h-px flex-1 bg-paper-edge dark:bg-slate-700" />
                or
                <span className="h-px flex-1 bg-paper-edge dark:bg-slate-700" />
              </div>
              <button
                type="button"
                onClick={passkeySignIn}
                disabled={pkLoading || loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper dark:bg-slate-800 py-3.5 font-bold text-stone-700 dark:text-slate-100 shadow-sm transition active:scale-[0.98] disabled:opacity-50"
              >
                {pkLoading ? (
                  <Spinner className="h-5 w-5" />
                ) : (
                  <>
                    <Fingerprint className="h-5 w-5 text-brand-600" /> Sign in with fingerprint
                  </>
                )}
              </button>
            </>
          )}

          <a
            href="/?forgot"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = '/login#forgot?redirect-to=/m'
            }}
            className="mt-4 block text-center text-sm font-semibold text-brand-600"
          >
            Forgot your password?
          </a>
        </form>

        <p className="vnl-rise text-center text-xs text-stone-400 dark:text-slate-500" style={{ animationDelay: '210ms' }}>
          Made for the Vernon crew · v1.0
        </p>
      </div>
    </div>
  )
}

// Scoped entrance animation. Inline so the page needs no extra dep.
// Honors prefers-reduced-motion (the looping hero motions are handled globally).
const vnlCss = `
.vnl-rise { animation: vnl-rise 0.5s cubic-bezier(0.22,1,0.36,1) both; }
@keyframes vnl-rise {
  0% { opacity: 0; transform: translateY(14px) scale(0.985); }
  100% { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .vnl-rise { animation: none !important; opacity: 1 !important; transform: none !important; }
}
`
