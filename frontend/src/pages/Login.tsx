import { useState } from 'react'
import { FolderKanban, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react'
import { login } from '@/lib/api'
import { Spinner } from '@/components/ui'

// In-app login (does NOT use the Frappe desk login page). Posts to
// /api/method/login and hard-reloads into /m on success.
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
    <div className="flex min-h-full flex-col bg-gradient-to-b from-brand-600 to-brand-800 pt-[env(safe-area-inset-top)]">
      <div className="flex flex-1 flex-col justify-center px-7 pb-[env(safe-area-inset-bottom)]">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center text-center text-white">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 backdrop-blur">
            <FolderKanban className="h-10 w-10" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Vernon Project</h1>
          <p className="mt-1.5 text-brand-100">Sign in to your workspace</p>
        </div>

        {/* Card */}
        <form
          onSubmit={submit}
          className="rounded-3xl bg-white p-6 shadow-xl animate-slide-up"
        >
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <label className="mb-1.5 block text-sm font-medium text-slate-600">Email</label>
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            value={usr}
            onChange={(e) => setUsr(e.target.value)}
            placeholder="you@vernon.id"
            className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[16px] text-slate-800 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
          />

          <label className="mb-1.5 block text-sm font-medium text-slate-600">Password</label>
          <div className="relative mb-5">
            <input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-[16px] text-slate-800 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
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

        <p className="mt-6 text-center text-xs text-brand-200">Vernon Project · Mobile v1.0</p>
      </div>
    </div>
  )
}
