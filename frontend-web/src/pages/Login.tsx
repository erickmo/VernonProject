import { useEffect, useState } from 'react'
import { Eye, EyeOff, FolderKanban, Loader2, Fingerprint } from 'lucide-react'
import { login } from '@/lib/api'
import { parseFrappeError } from '@/lib/format'
import { loginWithPasskey, platformAuthenticatorAvailable, isPasskeyCancel, describePasskeyError } from '@/lib/webauthn'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pkAvailable, setPkAvailable] = useState(false)
  const [pkBusy, setPkBusy] = useState(false)

  useEffect(() => {
    platformAuthenticatorAvailable().then(setPkAvailable)
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-surface shadow-xl p-8 space-y-5">
        <div className="flex items-center gap-2 text-brand-600 font-bold text-xl">
          <FolderKanban className="w-7 h-7" /> Vernon
        </div>
        {err && <div className="rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 text-sm px-3 py-2">{err}</div>}
        <div className="space-y-1">
          <label htmlFor="login-email" className="text-sm font-medium">Email</label>
          <input
            id="login-email"
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required
            className="w-full rounded-lg border border-line dark:border-slate-700 bg-transparent px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="login-pwd" className="text-sm font-medium">Password</label>
          <div className="relative">
            <input
              id="login-pwd"
              type={show ? 'text' : 'password'} value={pwd} onChange={(e) => setPwd(e.target.value)} required
              className="w-full rounded-lg border border-line dark:border-slate-700 bg-transparent px-3 py-2 pr-10"
            />
            <button type="button" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-600 text-white py-2.5 font-medium flex items-center justify-center gap-2 disabled:opacity-60">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Sign in
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
              className="w-full rounded-lg border border-line dark:border-slate-700 py-2.5 font-medium flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-hover/[0.04]"
            >
              {pkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4 text-brand-600" />}
              Sign in with fingerprint
            </button>
          </>
        )}
        <a href="/login#forgot?redirect-to=/w" className="block text-center text-sm text-brand-600">Forgot password?</a>
      </form>
    </div>
  )
}
