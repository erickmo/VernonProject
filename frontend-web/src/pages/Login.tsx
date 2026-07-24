import { useEffect, useState } from 'react'
import { Eye, EyeOff, FolderKanban, Loader2, Fingerprint, Mail, Lock, Heart } from 'lucide-react'
import { login } from '@/lib/api'
import { VERNON_VALUES, VERNON_STAKEHOLDERS } from '@/lib/values'
import { parseFrappeError } from '@/lib/format'
import { loginWithPasskey, passkeySupported, isPasskeyCancel, describePasskeyError } from '@/lib/webauthn'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pkAvailable, setPkAvailable] = useState(false)
  const [pkBusy, setPkBusy] = useState(false)

  useEffect(() => {
    // Show whenever the browser supports WebAuthn at all — not only when a
    // built-in biometric exists. On a desktop with no sensor the browser routes
    // to a phone (QR / hybrid) or security-key passkey.
    setPkAvailable(passkeySupported())
  }, [])

  const passkeySignIn = async () => {
    if (pkBusy || busy) return
    setPkBusy(true); setErr('')
    try {
      await loginWithPasskey()
      window.location.href = '/w'
    } catch (ex) {
      if (!isPasskeyCancel(ex)) setErr('Passkey — ' + describePasskeyError(ex))
      setPkBusy(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await login(email.trim(), pwd)
      window.location.href = '/w'
    } catch (ex) {
      setErr(parseFrappeError(ex instanceof Error ? ex.message : String(ex)) || 'Login failed')
      setBusy(false)
    }
  }

  const fieldCls =
    'w-full rounded-xl border border-line bg-paper-line/40 py-2.5 pl-10 text-sm text-ink placeholder:text-muted transition focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-800/60'

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 p-4">
      {/* Depth — soft glow orbs over the brand gradient */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-[#e879c7]/30 blur-3xl" />

      {/* VernonCorp values — the main message */}
      <div className="relative w-full max-w-md animate-rise text-center text-white">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/95 text-rose-500 shadow-lg">
          <Heart className="h-6 w-6" fill="currentColor" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">We&apos;re in the business of</p>
        <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Making people happy</h1>
        <p className="mt-4 text-xs font-semibold text-white/75">Who needs to be happy</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {VERNON_STAKEHOLDERS.map((s) => (
            <span key={s} className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm">{s}</span>
          ))}
        </div>
        <p className="mt-4 text-sm font-semibold text-white/90">{VERNON_VALUES.slice(1).join('  ·  ')}</p>
      </div>

      <form
        onSubmit={submit}
        className="relative w-full max-w-md animate-rise space-y-5 rounded-3xl bg-surface p-8 shadow-2xl ring-1 ring-black/5 sm:p-9 dark:ring-white/10"
      >
        {/* Brand mark + welcome */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-[#e879c7] text-white shadow-lg shadow-brand-600/30">
            <FolderKanban className="h-7 w-7" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">
            Sign in to <span className="font-semibold text-brand-600 dark:text-brand-400">Vernon</span>
          </p>
        </div>

        {err && (
          <div className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
            {err}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="login-email" className="text-sm font-medium text-ink">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="login-email"
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required
              placeholder="you@company.com"
              className={`${fieldCls} pr-3`}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="login-pwd" className="text-sm font-medium text-ink">Password</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="login-pwd"
              type={show ? 'text' : 'password'} value={pwd} onChange={(e) => setPwd(e.target.value)} required
              placeholder="••••••••"
              className={`${fieldCls} pr-10`}
            />
            <button type="button" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:-translate-y-0.5 hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60 disabled:hover:translate-y-0">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
        </button>

        {pkAvailable && (
          <>
            <div className="flex items-center gap-3 text-xs font-medium text-muted">
              <span className="h-px flex-1 bg-line dark:bg-slate-700" />
              or
              <span className="h-px flex-1 bg-line dark:bg-slate-700" />
            </div>
            <button
              type="button"
              onClick={passkeySignIn}
              disabled={pkBusy || busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink transition hover:bg-paper-line/50 active:scale-[0.98] disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800/60"
            >
              {pkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4 text-brand-600 dark:text-brand-400" />}
              Sign in with fingerprint
            </button>
          </>
        )}

        <a href="/login#forgot?redirect-to=/w" className="block text-center text-sm font-medium text-brand-600 transition hover:text-brand-700 dark:text-brand-400">Forgot password?</a>
      </form>
    </div>
  )
}
