import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut, KeyRound, Smartphone, Sparkles, Fingerprint, Trash2, Loader2, Wand2, Trophy, BookOpen, Wifi, WifiOff, RefreshCw, User } from 'lucide-react'
import { useBoot, usePasskeys, useEnrollPasskey, useRevokePasskey, useAvatarCatalog, useGamification, useClaimDaily, useSaveMyProfile } from '@/hooks/useData'
import { logout } from '@/lib/api'
import { Avatar } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { SearchableSelect } from '@/components/SearchableSelect'
import { ChangePasswordDialog } from '@web/components/ChangePasswordDialog'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { platformAuthenticatorAvailable, defaultDeviceLabel, isPasskeyCancel, describePasskeyError } from '@/lib/webauthn'
import { AvatarScene } from '@/avatar/AvatarScene'

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export default function Me({ onReplayOnboarding }: { onReplayOnboarding?: () => void }) {
  const boot = useBoot()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const [pwOpen, setPwOpen] = useState(false)
  const b = boot.data

  const refresh = async () => {
    await qc.invalidateQueries()
    toast('success', 'Refreshed')
  }

  const doLogout = async () => {
    await logout()
    window.location.href = '/w'
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Me</h1>

      <div
        className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
          online
            ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
        }`}
      >
        {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
        {online ? 'Online — synced with server' : 'Offline — showing saved data'}
      </div>

      <BentoGrid>
        {/* Profile hero */}
        <BentoTile span="lg" tall tone="gradient" accent="violet" title="Profile">
          <div className="flex flex-1 items-center gap-5 pt-2">
            <Avatar name={b?.full_name ?? '?'} image={b?.image ?? undefined} config={b?.avatar_config} size={72} />
            <div className="min-w-0">
              <div className="text-xl font-semibold">{b?.full_name}</div>
              <div className="text-sm text-muted">{b?.user}</div>
              {b?.badge && (
                <span
                  className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${b.badge.color ? '' : 'bg-canvas text-muted'}`}
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
                    className="text-xs px-2 py-0.5 rounded-full bg-white/60 dark:bg-slate-800 text-muted"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </BentoTile>

        {/* Settings & links */}
        <BentoTile span="md" tone="tint" accent="brand" title="Settings">
          <div className="divide-y divide-line/60 dark:divide-slate-700/60 -mx-5 mt-1">
            <button
              onClick={() => navigate('/me/info')}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-hover/[0.04]"
            >
              <User className="w-4 h-4" />
              My Info
            </button>
            <button
              onClick={() => navigate('/achievements')}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-hover/[0.04]"
            >
              <Trophy className="w-4 h-4" />
              Achievements
            </button>
            <button
              onClick={() => setPwOpen(true)}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-hover/[0.04]"
            >
              <KeyRound className="w-4 h-4" />
              Change password
            </button>
            {/* No push toggle on /w: the web build registers no service worker,
                so subscribeToPush would hang on navigator.serviceWorker.ready. */}
            <button
              onClick={refresh}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-hover/[0.04]"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh data
            </button>
            <a
              href="/m"
              className="w-full flex items-center gap-3 px-5 py-3 text-sm hover:bg-hover/[0.04]"
            >
              <Smartphone className="w-4 h-4" />
              Open mobile app
            </a>
            {onReplayOnboarding && (
              <button
                onClick={onReplayOnboarding}
                className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-hover/[0.04]"
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

        <GamificationTile />
        <DailyTile />
        <AvatarTile />
        <PasskeyTile />
        <VerseSettingsTile />
      </BentoGrid>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}

function GamificationTile() {
  const { data: gami } = useGamification()
  const toast = useToast()
  const grantedFired = useRef(false)

  useEffect(() => {
    if (!gami || grantedFired.current) return
    if (gami.newly_granted.length > 0) {
      grantedFired.current = true
      toast('success', `Reward unlocked! (${gami.newly_granted.length} new)`)
    }
  }, [gami, toast])

  return (
    <BentoTile span="md" tone="tint" accent="amber" title="Level" icon={Trophy}>
      {gami ? (
        <div className="mt-1 space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums">{gami.level}</span>
            <span className="text-sm text-muted">/ Lifetime {gami.lifetime.toLocaleString()} pts</span>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>XP progress</span>
              <span>{gami.xp_into}/{gami.points_per_level}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-amber-200/60 dark:bg-amber-500/20">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-500"
                style={{ width: `${Math.min(100, (gami.xp_into / gami.points_per_level) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">Loading…</div>
      )}
    </BentoTile>
  )
}

function DailyTile() {
  const { data: gami } = useGamification()
  const claimDaily = useClaimDaily()
  const toast = useToast()

  return (
    <BentoTile span="md" tone="tint" accent="emerald" title="Daily Reward">
      {gami ? (
        <div className="mt-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-3xl leading-none">🔥</span>
            <div>
              <p className="text-lg font-bold">Streak {gami.daily.streak}</p>
              <p className="text-xs text-muted">+{gami.daily.claimable} pts today</p>
            </div>
          </div>
          <button
            disabled={!gami.daily.can_claim || claimDaily.isPending}
            onClick={() =>
              claimDaily.mutate(undefined, {
                onSuccess: (r) => toast('success', `+${r.granted} pts!`),
                onError: () => toast('error', 'Could not claim'),
              })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {claimDaily.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Claim'}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">Loading…</div>
      )}
    </BentoTile>
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
      <div className="mt-1 flex h-44 items-center justify-center overflow-hidden rounded-xl bg-violet-50 dark:bg-violet-500/10">
        {catalog ? (
          <div className="h-40 w-40">
            <AvatarScene config={catalog.my} assets={catalog.assets} className="h-full w-full" />
          </div>
        ) : (
          <Avatar name={b?.full_name ?? '?'} image={b?.image ?? undefined} config={b?.avatar_config} size={72} />
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
              <div className="text-xs text-muted">
                {pk.last_used ? `Last used ${fmtDate(pk.last_used)}` : `Added ${fmtDate(pk.creation)}`}
              </div>
            </div>
            <button
              onClick={() => remove(pk.name, pk.label)}
              disabled={revoke.isPending}
              className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
              aria-label="Remove passkey"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {!isLoading && list.length === 0 && (
          <p className="text-sm text-muted">
            Use Touch ID / fingerprint to sign in on this device — no password needed.
          </p>
        )}
        <button
          onClick={add}
          disabled={enroll.isPending}
          className="mt-1 inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-brand-600 hover:bg-hover/[0.04] disabled:opacity-60 dark:border-slate-700"
        >
          {enroll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
          {list.length > 0 ? 'Add this device' : 'Set up fingerprint sign-in'}
        </button>
      </div>
    </BentoTile>
  )
}

const RELIGIONS = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu']
const VERSE_SUPPORTED = new Set(['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha'])

function VerseSettingsTile() {
  const { data: boot } = useBoot()
  const emp = boot?.employee
  const save = useSaveMyProfile()
  const toast = useToast()
  const [religion, setReligion] = useState('')
  const [verseEnabled, setVerseEnabled] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (emp && !hydrated) {
      setReligion(emp.religion ?? '')
      setVerseEnabled(!!emp.verse_enabled)
      setHydrated(true)
    }
  }, [emp, hydrated])

  const persist = (nextReligion: string, nextOn: boolean) => {
    save.mutate(
      { religion: nextReligion, verse_enabled: nextOn ? 1 : 0 },
      {
        onSuccess: () => toast('success', 'Tersimpan'),
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menyimpan'),
      },
    )
  }

  return (
    <BentoTile span="md" tone="tint" accent="violet" title="Ayat Harian" icon={BookOpen}>
      <div className="mt-1 space-y-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Agama</span>
          <SearchableSelect
            value={religion}
            onChange={(v) => { setReligion(v); persist(v, verseEnabled) }}
            placeholder="— Pilih —"
            options={RELIGIONS.map((r) => ({ value: r, label: r }))}
          />
        </label>
        {VERSE_SUPPORTED.has(religion) ? (
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink">Tampilkan ayat di beranda</span>
            <input
              type="checkbox"
              checked={verseEnabled}
              onChange={(e) => { const on = e.target.checked; setVerseEnabled(on); persist(religion, on) }}
              className="h-5 w-5 accent-violet-600"
            />
          </label>
        ) : religion ? (
          <p className="text-xs text-muted">Belum tersedia untuk agama ini.</p>
        ) : null}
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
