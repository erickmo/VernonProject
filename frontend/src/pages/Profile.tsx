import { useEffect, useRef, useState } from 'react'
import { LogOut, Wifi, WifiOff, BookOpen, ShieldCheck, RefreshCw, ChevronRight, Layers, Store, Users, KeyRound, Settings, Send, Bell, BellOff, ShieldAlert, CalendarClock, CalendarDays, Fingerprint, Trash2, Palette, MessageSquarePlus, QrCode, ClipboardList, Trophy, Zap, UsersRound, UserMinus, Building2, Ticket, ArrowLeftRight, DoorOpen, User, Banknote, Inbox, Sparkles } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { TabScreen } from '@/components/Layout'
import { Avatar, FullScreenLoader, ProgressBar, Segmented, Spinner } from '@/components/ui'
import { useNavigate } from 'react-router-dom'
import { useBoot, canManageGroups, canManageBrands, canManageCompanies, canManageUsers, canManageBadges, canManageAttendance, canManageResources, canManageIncome, canManageLms, usePasskeys, useEnrollPasskey, useRevokePasskey, useAvatarCatalog, useGamification, useClaimDaily, useFocusMode, useSaveMyProfile } from '@/hooks/useData'
import { AvatarScene } from '@/avatar/AvatarScene'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { logout } from '@/lib/api'
import { ChangePasswordSheet } from '@/components/ChangePasswordSheet'
import { platformAuthenticatorAvailable, defaultDeviceLabel, isPasskeyCancel, describePasskeyError } from '@/lib/webauthn'
import { type Theme, getStoredTheme, setTheme } from '@/lib/theme'
import type { FocusMode } from '@/lib/types'
import { pushSupported, subscribeToPush, unsubscribeFromPush, getPushSubscription } from '@/lib/push'

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

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
]

const FOCUS_OPTIONS: { value: FocusMode; label: string }[] = [
  { value: 'fullscreen', label: 'Full screen' },
  { value: 'inline', label: 'Timer only' },
]

const GENDER_OPTIONS: { value: 'Male' | 'Female'; label: string }[] = [
  { value: 'Male', label: 'Laki-laki' },
  { value: 'Female', label: 'Perempuan' },
]

export default function Profile({ onReplayOnboarding }: { onReplayOnboarding: () => void }) {
  const { data: boot, isLoading } = useBoot()
  const { data: catalog } = useAvatarCatalog()
  const { data: gami } = useGamification()
  const claimDaily = useClaimDaily()
  const focusMode = useFocusMode()
  const saveProfile = useSaveMyProfile()
  const gender = boot?.employee?.gender as 'Male' | 'Female' | undefined
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const online = useOnline()
  const [loggingOut, setLoggingOut] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const grantedFired = useRef(false)

  useEffect(() => {
    getPushSubscription().then((s) => setPushOn(!!s))
  }, [])

  // Fire once per load if server pushed new rewards
  useEffect(() => {
    if (!gami || grantedFired.current) return
    if (gami.newly_granted.length > 0) {
      grantedFired.current = true
      toast('success', `Reward unlocked! (${gami.newly_granted.length} new)`)
    }
  }, [gami, toast])

  const togglePush = async () => {
    if (pushBusy) return
    setPushBusy(true)
    try {
      if (pushOn) {
        await unsubscribeFromPush()
        setPushOn(false)
        toast('success', 'Notifications disabled')
      } else {
        const key = boot?.vapid_public_key
        if (!key) {
          toast('error', 'Push not configured')
          return
        }
        const ok = await subscribeToPush(key)
        setPushOn(ok)
        toast(ok ? 'success' : 'error', ok ? 'Notifications enabled' : 'Permission denied')
      }
    } catch {
      toast('error', 'Could not change notifications')
    } finally {
      setPushBusy(false)
    }
  }

  if (isLoading && !boot) {
    return (
      <TabScreen title="Me">
        <FullScreenLoader />
      </TabScreen>
    )
  }

  const refresh = async () => {
    await qc.invalidateQueries()
    toast('success', 'Refreshed')
  }

  const doLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    qc.clear()
    await logout()
    window.location.href = '/m'
  }

  const handleThemeChange = (v: Theme) => {
    setThemeState(v)
    setTheme(v)
  }

  // Menu grouped into 3 buckets: My Account / Features / System Settings.
  // Features + System Settings carry sub-groups; any (sub)group with no visible
  // rows hides itself, and a bucket whose every sub-group is empty is dropped.
  const menu: {
    title: string
    groups: {
      title: string
      rows: {
        icon: React.ComponentType<{ className?: string }>
        label: string
        hue: keyof typeof ROW_HUE
        onClick: () => void
      }[]
    }[]
  }[] = [
    {
      title: 'My Account',
      groups: [
        {
          title: '',
          rows: [
            { icon: User, label: 'My Info', hue: 'sky', onClick: () => navigate('/me/info') },
            { icon: Palette, label: 'Customize Avatar', hue: 'violet', onClick: () => navigate('/avatar') },
            { icon: Trophy, label: 'Achievements', hue: 'amber', onClick: () => navigate('/achievements') },
            { icon: Sparkles, label: 'Superpower', hue: 'violet', onClick: () => navigate(`/superpowers/${boot?.user}`) },
            { icon: KeyRound, label: 'Change password', hue: 'sky', onClick: () => setShowChangePw(true) },
            ...(pushSupported()
              ? [
                  {
                    icon: pushOn ? Bell : BellOff,
                    label: pushBusy ? 'Working…' : pushOn ? 'Notifications: On' : 'Enable notifications',
                    hue: 'sky' as const,
                    onClick: togglePush,
                  },
                ]
              : []),
          ],
        },
      ],
    },
    {
      title: 'Features',
      groups: [
        {
          title: 'Work',
          rows: [
            { icon: CalendarClock, label: 'Meetings', hue: 'sky', onClick: () => navigate('/meetings') },
            { icon: CalendarClock, label: 'Bookings', hue: 'sky', onClick: () => navigate('/bookings') },
            { icon: QrCode, label: 'Attendance', hue: 'sky', onClick: () => navigate('/attendance') },
          ],
        },
        {
          title: 'Community',
          rows: [
            { icon: CalendarDays, label: 'Events', hue: 'sky', onClick: () => navigate('/events') },
            { icon: Ticket, label: 'My Registrations', hue: 'sky', onClick: () => navigate('/my-registrations') },
            { icon: UsersRound, label: 'Team Wall', hue: 'violet', onClick: () => navigate('/team-wall') },
            { icon: Send, label: 'Send Points', hue: 'amber', onClick: () => navigate('/gift-points') },
            { icon: Banknote, label: 'Extra Income', hue: 'emerald', onClick: () => navigate('/income') },
            { icon: BookOpen, label: 'Learn', hue: 'indigo', onClick: () => navigate('/learn') },
          ],
        },
      ],
    },
    {
      title: 'System Settings',
      groups: [
        {
          title: 'App',
          rows: [
            { icon: Sparkles, label: "What's New", hue: 'violet', onClick: () => navigate('/whats-new') },
            { icon: MessageSquarePlus, label: 'Send feedback', hue: 'violet', onClick: () => navigate('/feedback') },
            { icon: RefreshCw, label: 'Refresh data', hue: 'slate', onClick: refresh },
            { icon: BookOpen, label: 'Replay quick tour', hue: 'slate', onClick: onReplayOnboarding },
          ],
        },
        {
          title: 'User Management',
          rows: [
            ...(canManageUsers(boot)
              ? [{ icon: Users, label: 'Manage Users', hue: 'sky' as const, onClick: () => navigate('/users') }]
              : []),
            ...(canManageUsers(boot)
              ? [{ icon: ArrowLeftRight, label: 'Transfer Tasks', hue: 'sky' as const, onClick: () => navigate('/transfer-tasks') }]
              : []),
            ...(boot?.roles.includes('System Manager')
              ? [{ icon: UserMinus, label: 'Under-Occupied', hue: 'amber' as const, onClick: () => navigate('/reports/under-occupied') }]
              : []),
          ],
        },
        {
          title: 'Feedbacks',
          rows: [
            ...(canManageUsers(boot)
              ? [{ icon: Inbox, label: 'Feedback Inbox', hue: 'sky' as const, onClick: () => navigate('/feedback-inbox') }]
              : []),
          ],
        },
        {
          title: 'Points',
          rows: [
            ...(canManageBadges(boot)
              ? [{ icon: Zap, label: 'Gamification', hue: 'amber' as const, onClick: () => navigate('/gamification-settings') }]
              : []),
            ...(boot?.roles.includes('System Manager')
              ? [{ icon: Sparkles, label: 'Superpower', hue: 'violet' as const, onClick: () => navigate('/superpower-admin') }]
              : []),
          ],
        },
        {
          title: 'Companies',
          rows: [
            ...(canManageCompanies(boot)
              ? [{ icon: Building2, label: 'Manage Companies', hue: 'sky' as const, onClick: () => navigate('/companies') }]
              : []),
            ...(canManageBrands(boot)
              ? [{ icon: Store, label: 'Manage Brands', hue: 'pink' as const, onClick: () => navigate('/brands') }]
              : []),
          ],
        },
        {
          title: 'Admin',
          rows: [
            ...(canManageAttendance(boot)
              ? [{ icon: ClipboardList, label: 'Manage attendance', hue: 'emerald' as const, onClick: () => navigate('/attendance/manage') }]
              : []),
            ...(canManageIncome(boot)
              ? [{ icon: Banknote, label: 'Manage Extra Income', hue: 'emerald' as const, onClick: () => navigate('/income-admin') }]
              : []),
            ...(canManageLms(boot)
              ? [{ icon: BookOpen, label: 'Manage Learning', hue: 'indigo' as const, onClick: () => navigate('/learn-admin') }]
              : []),
            ...(canManageGroups(boot)
              ? [{ icon: Layers, label: 'Manage Groups', hue: 'emerald' as const, onClick: () => navigate('/groups') }]
              : []),
            ...(canManageResources(boot)
              ? [{ icon: DoorOpen, label: 'Resources', hue: 'indigo' as const, onClick: () => navigate('/meeting-rooms') }]
              : []),
            ...(canManageGroups(boot)
              ? [{ icon: ShieldAlert, label: 'Data Health', hue: 'rose' as const, onClick: () => navigate('/data-health') }]
              : []),
            ...(canManageGroups(boot)
              ? [{ icon: Settings, label: 'Settings', hue: 'slate' as const, onClick: () => navigate('/settings') }]
              : []),
          ],
        },
      ],
    },
  ]

  return (
    <TabScreen title="Me">
      {boot && (
        <>
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-6 shadow-card">
            {catalog && boot.avatar_config ? (
              // avatar_config is nulled server-side when the user uploaded a real
              // photo, so that photo wins over the gamified scene here too.
              <div className="relative h-[72px] w-[72px] overflow-hidden rounded-full border-2 border-paper-edge dark:border-slate-700">
                <AvatarScene config={catalog.my} assets={catalog.assets} className="h-full w-full" />
              </div>
            ) : (
              <Avatar name={boot.full_name} image={boot.image} config={boot.avatar_config} size={72} />
            )}
            <div className="text-center">
              <p className="font-display text-lg font-bold text-stone-800 dark:text-slate-50">{boot.full_name}</p>
              <p className="text-sm text-stone-400 dark:text-slate-500">{boot.user}</p>
            </div>
            <button
              onClick={() => navigate('/avatar')}
              className="flex items-center gap-1.5 rounded-full bg-brand-50 dark:bg-brand-500/15 px-3 py-1.5 text-sm font-semibold text-brand-600 dark:text-brand-300 transition active:scale-95"
            >
              <Palette className="h-3.5 w-3.5" />
              Customize
            </button>
            {boot.badge && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                style={
                  boot.badge.color
                    ? { backgroundColor: `${boot.badge.color}22`, color: boot.badge.color }
                    : undefined
                }
              >
                {boot.badge.icon && <span>{boot.badge.icon}</span>}
                {boot.badge.tier_name}
              </span>
            )}
            <div className="flex flex-wrap justify-center gap-1.5">
              {boot.roles.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-300"
                >
                  <ShieldCheck className="h-3 w-3" />
                  {r}
                </span>
              ))}
            </div>

            {gami && (
              <div className="w-full pt-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">Level {gami.level}</span>
                  <span className="text-xs text-stone-400 dark:text-slate-500">{gami.xp_into}/{gami.points_per_level} XP</span>
                </div>
                <ProgressBar value={(gami.xp_into / gami.points_per_level) * 100} />
              </div>
            )}
          </div>

          <div
            className={`mt-3 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium ${
              online
                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
            }`}
          >
            {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {online ? 'Online — synced with server' : 'Offline — showing saved data'}
          </div>

          {gami && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 shadow-card">
              <div className="text-2xl leading-none">🔥</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-700 dark:text-slate-200">
                  Daily reward — streak {gami.daily.streak}
                </p>
                <p className="text-xs text-stone-400 dark:text-slate-500">
                  +{gami.daily.claimable} pts available
                </p>
              </div>
              <button
                disabled={!gami.daily.can_claim || claimDaily.isPending}
                onClick={() =>
                  claimDaily.mutate(undefined, {
                    onSuccess: (r) => toast('success', `+${r.granted} pts!`),
                    onError: () => toast('error', 'Could not claim'),
                  })
                }
                className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50"
              >
                {claimDaily.isPending ? <Spinner className="h-3.5 w-3.5" /> : 'Claim'}
              </button>
            </div>
          )}

          {/* Appearance */}
          <div className="mt-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 shadow-card">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
              Appearance
            </p>
            <Segmented options={THEME_OPTIONS} value={theme} onChange={handleThemeChange} />
          </div>

          {/* Focus mode */}
          <div className="mt-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 shadow-card">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
              Focus
            </p>
            <Segmented
              options={FOCUS_OPTIONS}
              value={focusMode}
              onChange={(v: FocusMode) => saveProfile.mutate({ focus_mode: v })}
            />
            <p className="mt-2 text-xs text-stone-500 dark:text-slate-400">
              {focusMode === 'inline'
                ? 'Tapping Focus just starts the timer on the task — no full-screen.'
                : 'Tapping Focus opens the full-screen focus screen.'}
            </p>
          </div>

          {/* Gender */}
          <div className="mt-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 shadow-card">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
              Gender
            </p>
            <div className="flex gap-2">
              {GENDER_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => saveProfile.mutate({ gender: o.value })}
                  className={`flex-1 rounded-xl border py-2 text-sm font-semibold ${
                    gender === o.value
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 bg-white text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {!gender && (
              <p className="mt-2 text-xs text-stone-400">
                Pilih jenis kelamin untuk mengakses kategori cuti khusus.
              </p>
            )}
          </div>

          <PasskeyCard />

          {menu.map((section) => {
            const groups = section.groups.filter((g) => g.rows.length > 0)
            if (groups.length === 0) return null
            return (
              <div key={section.title} className="mt-6">
                <p className="mb-2 px-1 text-sm font-bold text-stone-700 dark:text-slate-200">
                  {section.title}
                </p>
                {groups.map((g) => (
                  <div key={g.title || section.title} className="mt-2">
                    {g.title && (
                      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                        {g.title}
                      </p>
                    )}
                    <div className="divide-y divide-paper-edge dark:divide-slate-700 overflow-hidden rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 shadow-card">
                      {g.rows.map((r) => (
                        <Row key={r.label} icon={r.icon} label={r.label} hue={r.hue} onClick={r.onClick} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          <button
            onClick={doLogout}
            disabled={loggingOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 py-3.5 font-semibold text-rose-600 shadow-sm active:bg-rose-50 disabled:opacity-60"
          >
            {loggingOut ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <>
                <LogOut className="h-4 w-4" /> Log out
              </>
            )}
          </button>

          <p className="mt-6 text-center text-xs text-stone-300 dark:text-slate-600">Vernon Project · Mobile v1.0</p>

          <ChangePasswordSheet open={showChangePw} onClose={() => setShowChangePw(false)} />
        </>
      )}
    </TabScreen>
  )
}

function PasskeyCard() {
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
      if (isPasskeyCancel(e)) return
      toast('error', 'Passkey — ' + describePasskeyError(e))
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
    <div className="mt-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 shadow-card">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
        Fingerprint sign-in
      </p>

      {list.length > 0 && (
        <div className="mb-2 divide-y divide-paper-edge dark:divide-slate-700">
          {list.map((pk) => (
            <div key={pk.name} className="flex items-center gap-3 py-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
                <Fingerprint className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-700 dark:text-slate-200">{pk.label || 'This device'}</p>
                <p className="text-xs text-stone-400 dark:text-slate-500">
                  {pk.last_used ? `Last used ${fmtDate(pk.last_used)}` : `Added ${fmtDate(pk.creation)}`}
                </p>
              </div>
              <button
                onClick={() => remove(pk.name, pk.label)}
                disabled={revoke.isPending}
                className="rounded-lg p-2 text-stone-400 active:bg-rose-50 active:text-rose-600 disabled:opacity-50 dark:text-slate-500"
                aria-label="Remove passkey"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!isLoading && list.length === 0 && (
        <p className="mb-3 text-sm text-stone-500 dark:text-slate-400">
          Use Face ID / fingerprint to sign in on this device — no password needed.
        </p>
      )}

      <button
        onClick={add}
        disabled={enroll.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-paper-edge dark:border-slate-700 bg-paper dark:bg-slate-900 py-2.5 text-sm font-semibold text-brand-600 active:scale-[0.99] disabled:opacity-60"
      >
        {enroll.isPending ? <Spinner className="h-4 w-4" /> : <Fingerprint className="h-4 w-4" />}
        {list.length > 0 ? 'Add this device' : 'Set up fingerprint sign-in'}
      </button>
    </div>
  )
}

function fmtDate(s: string): string {
  const d = new Date(s.replace(' ', 'T'))
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

const ROW_HUE: Record<string, string> = {
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  pink: 'bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
  slate: 'bg-paper-line text-stone-500 dark:bg-slate-700 dark:text-slate-300',
}

function Row({
  icon: Icon,
  label,
  onClick,
  hue = 'sky',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  hue?: keyof typeof ROW_HUE
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-stone-700 dark:text-slate-200 active:bg-paper dark:active:bg-slate-700/50"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ROW_HUE[hue]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-stone-300 dark:text-slate-600" />
    </button>
  )
}
