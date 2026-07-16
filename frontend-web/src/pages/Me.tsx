import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
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

// Vertical card stack, echoing mobile Profile's grouping order:
// identity/avatar → stats → settings entries. Every section is full-width
// (BentoTile span="full") so it reads as a single-column stack, not a mosaic.
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
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Me</h1>
        <OnlinePill online={online} />
      </div>

      {/* Player-card hero: identity + level + XP + streak in one glance. */}
      <ProfileHero />

      <BentoGrid>
        <AvatarTile />
        <DailyTile />

        {/* Tall right-rail: fills the 3rd column across both tile rows so the
            3-col grid packs cleanly (no lone tile). */}
        <BentoTile span="md" tall tone="tint" accent="brand" title="Settings">
          <div className="divide-y divide-line/60 dark:divide-slate-700/60 -mx-5 mt-1">
          <button
            onClick={() => navigate('/me/info')}
            className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-hover/[0.04] active:scale-[0.99]"
          >
            <User className="w-4 h-4" />
            My Info
          </button>
          <button
            onClick={() => navigate('/achievements')}
            className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-hover/[0.04] active:scale-[0.99]"
          >
            <Trophy className="w-4 h-4" />
            Achievements
          </button>
          <button
            onClick={() => setPwOpen(true)}
            className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-hover/[0.04] active:scale-[0.99]"
          >
            <KeyRound className="w-4 h-4" />
            Change password
          </button>
          {/* No push toggle on /w: the web build registers no service worker,
              so subscribeToPush would hang on navigator.serviceWorker.ready. */}
          <button
            onClick={refresh}
            className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-hover/[0.04] active:scale-[0.99]"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh data
          </button>
          <a
            href="/m"
            className="w-full flex items-center gap-3 px-5 py-3 text-sm hover:bg-hover/[0.04] active:scale-[0.99]"
          >
            <Smartphone className="w-4 h-4" />
            Open mobile app
          </a>
          {onReplayOnboarding && (
            <button
              onClick={onReplayOnboarding}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-hover/[0.04] active:scale-[0.99]"
            >
              <Sparkles className="w-4 h-4" />
              Replay onboarding
            </button>
          )}
          <button
            onClick={doLogout}
            className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 active:scale-[0.99]"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
          </div>
        </BentoTile>

        <PasskeyTile />
        <VerseSettingsTile />
        <GenderTile />
      </BentoGrid>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}

function OnlinePill({ online }: { online: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
        online
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
      )}
      title={online ? 'Synced with server' : 'Showing saved data'}
    >
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {online ? 'Online' : 'Offline'}
    </span>
  )
}

// Gamified identity header: avatar + name + badge/roles, then a level+XP+streak
// panel. Folds in the old Profile and Level tiles (and their duplicate avatar).
function ProfileHero() {
  const { data: b } = useBoot()
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

  const ppl = gami?.points_per_level || 0
  const pct = ppl ? Math.min(100, (gami!.xp_into / ppl) * 100) : 0
  const toNext = ppl ? Math.max(0, ppl - gami!.xp_into) : 0

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-violet-600 to-brand-700 p-6 text-white shadow-card">
      {/* soft glow for depth */}
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-white/5 blur-2xl" />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="shrink-0 rounded-full ring-4 ring-white/25">
          <Avatar name={b?.full_name ?? '?'} image={b?.image ?? undefined} config={b?.avatar_config} size={80} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xl font-bold leading-tight">{b?.full_name}</div>
          <div className="truncate text-sm text-white/70">{b?.user}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {b?.badge && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm">
                {b.badge.icon && <span>{b.badge.icon}</span>}
                {b.badge.tier_name}
              </span>
            )}
            {(b?.roles ?? []).map((r) => (
              <span key={r} className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Level · XP · streak */}
      <div className="relative mt-5 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-white/70">Level</span>
            <span className="text-3xl font-bold leading-none tabular-nums">{gami?.level ?? '—'}</span>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold leading-none tabular-nums">🔥 {gami?.daily.streak ?? 0}</div>
            <div className="text-[11px] text-white/60">day streak</div>
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-white/70">
          <span>{gami ? `${gami.xp_into}/${gami.points_per_level} XP` : '…'}</span>
          <span>
            {gami ? (toNext > 0 ? `${toNext} to next` : 'Max level') : ''}
            {gami ? ` · ${gami.lifetime.toLocaleString()} lifetime` : ''}
          </span>
        </div>
      </div>
    </div>
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
              className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
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

const GENDER_OPTIONS: { value: 'Male' | 'Female'; label: string }[] = [
  { value: 'Male', label: 'Laki-laki' },
  { value: 'Female', label: 'Perempuan' },
]

function GenderTile() {
  const { data: boot } = useBoot()
  const save = useSaveMyProfile()
  const gender = boot?.employee?.gender as 'Male' | 'Female' | undefined

  return (
    <BentoTile span="md" tone="tint" accent="sky" title="Jenis Kelamin" icon={User}>
      <div className="mt-1 flex gap-2">
        {GENDER_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => save.mutate({ gender: o.value })}
            className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition ${
              gender === o.value
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-line text-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {!gender && (
        <p className="mt-2 text-xs text-muted">
          Pilih jenis kelamin untuk mengakses kategori cuti khusus.
        </p>
      )}
    </BentoTile>
  )
}

function fmtDate(s: string): string {
  const d = new Date(s.replace(' ', 'T'))
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
