import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, KeyRound, Smartphone, Sparkles, Fingerprint, Trash2, Loader2, Wand2 } from 'lucide-react'
import { useBoot, usePasskeys, useEnrollPasskey, useRevokePasskey, useAvatarCatalog } from '@/hooks/useData'
import { logout } from '@/lib/api'
import { Avatar } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { ChangePasswordDialog } from '@web/components/ChangePasswordDialog'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { platformAuthenticatorAvailable, defaultDeviceLabel, isPasskeyCancel, describePasskeyError } from '@/lib/webauthn'
import { AvatarViewer } from '@/avatar/AvatarViewer'
import { AvatarBoundary } from '@/avatar/AvatarBoundary'

export default function Me({ onReplayOnboarding }: { onReplayOnboarding?: () => void }) {
  const boot = useBoot()
  const [pwOpen, setPwOpen] = useState(false)
  const b = boot.data

  const doLogout = async () => {
    await logout()
    window.location.href = '/w'
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Me</h1>

      <BentoGrid>
        {/* Profile hero */}
        <BentoTile span="lg" tall tone="gradient" accent="violet" title="Profile">
          <div className="flex flex-1 items-center gap-5 pt-2">
            <Avatar name={b?.full_name ?? '?'} image={b?.image ?? undefined} size={72} />
            <div className="min-w-0">
              <div className="text-xl font-semibold">{b?.full_name}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{b?.user}</div>
              {b?.badge && (
                <span
                  className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${b.badge.color ? '' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                  style={b.badge.color ? { backgroundColor: `${b.badge.color}22`, color: b.badge.color } : undefined}
                >
                  {b.badge.icon && <span>{b.badge.icon}</span>}
                  {b.badge.tier_name}
                </span>
              )}
              <div className="flex flex-wrap gap-1 mt-3">
                {(b?.roles ?? []).map((r) => (
                  <span
                    key={r}
                    className="text-xs px-2 py-0.5 rounded-full bg-white/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </BentoTile>

        {/* Settings & links */}
        <BentoTile span="md" tone="tint" accent="slate" title="Settings">
          <div className="divide-y divide-slate-200/60 dark:divide-slate-700/60 -mx-5 mt-1">
            <button
              onClick={() => setPwOpen(true)}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/60"
            >
              <KeyRound className="w-4 h-4" />
              Change password
            </button>
            <a
              href="/m"
              className="w-full flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-100/60 dark:hover:bg-slate-800/60"
            >
              <Smartphone className="w-4 h-4" />
              Open mobile app
            </a>
            {onReplayOnboarding && (
              <button
                onClick={onReplayOnboarding}
                className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/60"
              >
                <Sparkles className="w-4 h-4" />
                Replay onboarding
              </button>
            )}
            <button
              onClick={doLogout}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>
        </BentoTile>

        <AvatarTile />
        <PasskeyTile />
      </BentoGrid>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}

function AvatarTile() {
  const navigate = useNavigate()
  const { data: catalog } = useAvatarCatalog()
  const boot = useBoot()
  const b = boot.data

  return (
    <BentoTile span="md" tone="tint" accent="violet" title="My Avatar" icon={Wand2}
      actions={
        <button
          type="button"
          onClick={() => navigate('/avatar')}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition"
        >
          Customize
        </button>
      }
    >
      <div className="mt-1 h-44 overflow-hidden rounded-xl">
        {catalog ? (
          <AvatarBoundary fallback={
            <div className="flex h-full items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-500/10">
              <Avatar name={b?.full_name ?? '?'} image={b?.image ?? undefined} size={72} />
            </div>
          }>
            <AvatarViewer interactive={false} config={catalog.my} items={catalog.items} />
          </AvatarBoundary>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-500/10 text-xs text-slate-400">
            Loading avatar…
          </div>
        )}
      </div>
    </BentoTile>
  )
}

function PasskeyTile() {
  const [available, setAvailable] = useState(false)
  const { data, isLoading } = usePasskeys()
  const enroll = useEnrollPasskey()
  const revoke = useRevokePasskey()
  const toast = useToast()
  const confirm = useConfirm()

  useEffect(() => {
    platformAuthenticatorAvailable().then(setAvailable)
  }, [])

  if (!available) return null

  const list = data?.passkeys ?? []

  const add = async () => {
    try {
      await enroll.mutateAsync(defaultDeviceLabel())
      toast('success', 'Fingerprint sign-in enabled')
    } catch (e) {
      if (!isPasskeyCancel(e)) toast('error', 'Passkey — ' + describePasskeyError(e))
    }
  }

  const remove = async (name: string, label: string | null) => {
    const ok = await confirm({
      title: 'Remove passkey',
      message: `Remove “${label || 'this device'}”? You'll need your password to sign in there again.`,
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    try {
      await revoke.mutateAsync(name)
      toast('success', 'Passkey removed')
    } catch {
      toast('error', 'Could not remove passkey')
    }
  }

  return (
    <BentoTile span="md" tone="tint" accent="sky" title="Fingerprint sign-in">
      <div className="mt-1 space-y-2">
        {list.map((pk) => (
          <div key={pk.name} className="flex items-center gap-3">
            <Fingerprint className="w-4 h-4 shrink-0 text-brand-600" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{pk.label || 'This device'}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {pk.last_used ? `Last used ${fmtDate(pk.last_used)}` : `Added ${fmtDate(pk.creation)}`}
              </div>
            </div>
            <button
              onClick={() => remove(pk.name, pk.label)}
              disabled={revoke.isPending}
              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
              aria-label="Remove passkey"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {!isLoading && list.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Use Touch ID / fingerprint to sign in on this device — no password needed.
          </p>
        )}
        <button
          onClick={add}
          disabled={enroll.isPending}
          className="mt-1 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-slate-100/60 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800/60"
        >
          {enroll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
          {list.length > 0 ? 'Add this device' : 'Set up fingerprint sign-in'}
        </button>
      </div>
    </BentoTile>
  )
}

function fmtDate(s: string): string {
  const d = new Date(s.replace(' ', 'T'))
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
