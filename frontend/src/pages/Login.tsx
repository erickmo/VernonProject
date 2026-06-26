import { useState } from 'react'
import { FolderKanban, Eye, EyeOff, LogIn, AlertCircle, Sparkles } from 'lucide-react'
import { login } from '@/lib/api'
import { Spinner } from '@/components/ui'

// In-app login (does NOT use the Frappe desk login page). Posts to
// /api/method/login and hard-reloads into /m on success.
//
// Layout: a solid color-blocked "bento" mosaic (flat opaque tiles, crisp
// borders, no blur/transparency) over a plain canvas, with the form as the
// hero tile beneath. Entrance is a short staggered rise; tiles are static.
// Scoped <style> below = no Tailwind config change / new dep.
export default function Login() {
  const [usr, setUsr] = useState('')
  const [pwd, setPwd] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <div className="flex min-h-full flex-col bg-slate-100 dark:bg-slate-950 pt-[env(safe-area-inset-top)]">
      <style>{vnlCss}</style>

      <div className="flex flex-1 flex-col justify-center gap-3.5 px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* Color-blocked bento mosaic (3-col, alternating spans) */}
        <div className="grid grid-cols-3 gap-3.5" style={{ gridAutoRows: '6.5rem' }}>
          {/* Logo tile (wide) — solid brand fill */}
          <div className="vnl-rise col-span-2 flex flex-col justify-between rounded-3xl border border-brand-700/50 bg-brand-600 p-4 shadow-sm" style={{ animationDelay: '40ms' }}>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-brand-600">
              <FolderKanban className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-none tracking-tight text-white">Vernon Project</h1>
              <p className="mt-1.5 text-xs font-medium text-brand-100">Sign in to your workspace</p>
            </div>
          </div>

          {/* Accent tile (narrow) — pink pop */}
          <div className="vnl-rise relative col-span-1 overflow-hidden rounded-3xl border border-pink-600/40 bg-pink-500 p-4 shadow-sm" style={{ animationDelay: '110ms' }}>
            <div className="absolute right-3 top-3 h-3 w-3 rounded-[4px] bg-white/80" />
            <Sparkles className="absolute bottom-3 left-3 h-8 w-8 text-white" strokeWidth={2.25} />
          </div>

          {/* Geometry tile (narrow) — emerald + flat dot grid, multi-hue shapes */}
          <div className="vnl-rise relative col-span-1 overflow-hidden rounded-3xl border border-emerald-700/40 bg-emerald-500 shadow-sm" style={{ animationDelay: '180ms' }}>
            <div className="vnl-dots absolute inset-0" />
            <div className="absolute -bottom-5 -right-5 h-16 w-16 rounded-2xl bg-sky-400" />
            <div className="absolute left-3 top-3 h-3 w-3 rounded-full bg-amber-300" />
          </div>

          {/* Tagline tile (wide) — white card */}
          <div className="vnl-rise col-span-2 flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" style={{ animationDelay: '250ms' }}>
            <p className="text-lg font-semibold leading-tight tracking-tight text-slate-900 dark:text-white">
              Your work,<br />
              <span className="text-brand-600">one place.</span>
            </p>
            {/* multi-hue swatch — the palette signature */}
            <div className="grid shrink-0 grid-cols-2 gap-1.5">
              <div className="h-3 w-3 rounded-[4px] bg-brand-600" />
              <div className="h-3 w-3 rounded-[4px] bg-pink-500" />
              <div className="h-3 w-3 rounded-[4px] bg-emerald-500" />
              <div className="h-3 w-3 rounded-[4px] bg-amber-400" />
            </div>
          </div>
        </div>

        {/* Form — hero tile */}
        <form
          onSubmit={submit}
          className="vnl-rise rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          style={{ animationDelay: '330ms' }}
        >
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">Email</label>
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            value={usr}
            onChange={(e) => setUsr(e.target.value)}
            placeholder="you@vernon.id"
            className="mb-4 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-[16px] text-slate-800 dark:text-slate-100 outline-none transition focus:border-brand-400 focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-brand-100 dark:placeholder-slate-500"
          />

          <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">Password</label>
          <div className="relative mb-5">
            <input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 pr-12 text-[16px] text-slate-800 dark:text-slate-100 outline-none transition focus:border-brand-400 focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-brand-100 dark:placeholder-slate-500"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || !usr || !pwd}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white shadow-sm transition active:bg-brand-700 disabled:opacity-50"
          >
            {loading ? (
              <Spinner className="h-5 w-5" />
            ) : (
              <>
                <LogIn className="h-5 w-5" /> Log in
              </>
            )}
          </button>

          <a
            href="/?forgot"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = '/login#forgot?redirect-to=/m'
            }}
            className="mt-4 block text-center text-sm font-medium text-brand-600"
          >
            Forgot password?
          </a>
        </form>

        <p className="vnl-rise text-center text-xs text-slate-400 dark:text-slate-500" style={{ animationDelay: '410ms' }}>
          Vernon Project · Mobile v1.0
        </p>
      </div>
    </div>
  )
}

// Scoped styles. Inline so the page needs no Tailwind config change / new dep.
// Honors prefers-reduced-motion.
const vnlCss = `
.vnl-rise { animation: vnl-rise 0.5s cubic-bezier(0.22,1,0.36,1) both; }
.vnl-dots {
  background-image: radial-gradient(circle, rgba(255,255,255,0.22) 1px, transparent 1.4px);
  background-size: 12px 12px;
}
@keyframes vnl-rise {
  0% { opacity: 0; transform: translateY(14px) scale(0.985); }
  100% { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .vnl-rise { animation: none !important; opacity: 1 !important; transform: none !important; }
}
`
