import { useEffect, useRef, useState } from 'react'
import { LogOut, Wifi, WifiOff, BookOpen, ShieldCheck, RefreshCw, ChevronRight, Layers, Store, Users, KeyRound, Settings, Gift, Send, Award, Bell, BellOff, ShieldAlert, CalendarClock, CalendarCog, CalendarDays, Fingerprint, Trash2, Palette, MessageSquarePlus, QrCode, ClipboardList, Trophy, Zap, UsersRound, UserMinus, Building2, Ticket, ArrowLeftRight, DoorOpen, Projector, User, Phone, MapPin, Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { TabScreen } from '@/components/Layout'
import { Avatar, FullScreenLoader, ProgressBar, Segmented, Spinner } from '@/components/ui'
import { useNavigate } from 'react-router-dom'
import { useBoot, canManageGroups, canManageBrands, canManageCompanies, canManageUsers, canManageMarketplace, canGrantPoints, canManageBadges, canManageAttendance, canManageResources, usePasskeys, useEnrollPasskey, useRevokePasskey, useAvatarCatalog, useGamification, useClaimDaily, useSaveMyProfile } from '@/hooks/useData'
import type { EmployeeSoft, LeaveBalance, EmployeeChildSkill, EmployeeChildEducation, EmployeeChildTraining } from '@/lib/types'
import { AvatarScene } from '@/avatar/AvatarScene'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { logout } from '@/lib/api'
import { ChangePasswordSheet } from '@/components/ChangePasswordSheet'
import { platformAuthenticatorAvailable, defaultDeviceLabel, isPasskeyCancel, describePasskeyError } from '@/lib/webauthn'
import { type Theme, getStoredTheme, setTheme } from '@/lib/theme'
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

export default function Profile({ onReplayOnboarding }: { onReplayOnboarding: () => void }) {
  const { data: boot, isLoading } = useBoot()
  const { data: catalog } = useAvatarCatalog()
  const { data: gami } = useGamification()
  const claimDaily = useClaimDaily()
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

  // Grouped menu. Admin rows are gated; sections with no visible rows are hidden.
  const menu: {
    title: string
    rows: {
      icon: React.ComponentType<{ className?: string }>
      label: string
      hue: keyof typeof ROW_HUE
      onClick: () => void
    }[]
  }[] = [
    {
      title: 'Account',
      rows: [
        { icon: Palette, label: 'Customize Avatar', hue: 'violet', onClick: () => navigate('/avatar') },
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
        { icon: KeyRound, label: 'Change password', hue: 'sky', onClick: () => setShowChangePw(true) },
      ],
    },
    {
      title: 'Work',
      rows: [
        { icon: CalendarDays, label: 'Events', hue: 'sky', onClick: () => navigate('/events') },
        { icon: CalendarClock, label: 'Bookings', hue: 'sky', onClick: () => navigate('/bookings') },
        { icon: CalendarCog, label: 'Manage Events', hue: 'emerald', onClick: () => navigate('/events/manage') },
        { icon: Ticket, label: 'My Registrations', hue: 'sky', onClick: () => navigate('/my-registrations') },
        { icon: CalendarClock, label: 'Meetings', hue: 'sky', onClick: () => navigate('/meetings') },
        { icon: QrCode, label: 'Attendance', hue: 'sky', onClick: () => navigate('/attendance') },
        ...(canManageAttendance(boot)
          ? [
              {
                icon: ClipboardList,
                label: 'Manage attendance',
                hue: 'emerald' as const,
                onClick: () => navigate('/attendance/manage'),
              },
            ]
          : []),
      ],
    },
    {
      title: 'Points & Rewards',
      rows: [
        { icon: UsersRound, label: 'Team Wall', hue: 'violet', onClick: () => navigate('/team-wall') },
        { icon: Trophy, label: 'Achievements', hue: 'amber', onClick: () => navigate('/achievements') },
        { icon: Send, label: 'Gift Points', hue: 'amber', onClick: () => navigate('/gift-points') },
        ...(canGrantPoints(boot)
          ? [{ icon: Gift, label: 'Grant Points', hue: 'amber' as const, onClick: () => navigate('/grant-points') }]
          : []),
        ...(canManageBadges(boot)
          ? [{ icon: Zap, label: 'Gamification', hue: 'amber' as const, onClick: () => navigate('/gamification-settings') }]
          : []),
        ...(canManageMarketplace(boot)
          ? [{ icon: Store, label: 'Manage Marketplace', hue: 'amber' as const, onClick: () => navigate('/marketplace-admin') }]
          : []),
      ],
    },
    {
      title: 'Users & Access',
      rows: [
        ...(canManageUsers(boot)
          ? [{ icon: Users, label: 'Manage Users', hue: 'sky' as const, onClick: () => navigate('/users') }]
          : []),
        ...(canManageUsers(boot)
          ? [{ icon: ArrowLeftRight, label: 'Transfer Tasks', hue: 'sky' as const, onClick: () => navigate('/transfer-tasks') }]
          : []),
        ...(canManageBrands(boot)
          ? [{ icon: Store, label: 'Manage Brands', hue: 'pink' as const, onClick: () => navigate('/brands') }]
          : []),
        ...(canManageResources(boot)
          ? [{ icon: DoorOpen, label: 'Manage Meeting Rooms', hue: 'indigo' as const, onClick: () => navigate('/meeting-rooms') }]
          : []),
        ...(canManageResources(boot)
          ? [{ icon: Projector, label: 'Manage Equipment', hue: 'indigo' as const, onClick: () => navigate('/equipment') }]
          : []),
        ...(canManageCompanies(boot)
          ? [{ icon: Building2, label: 'Manage Companies', hue: 'sky' as const, onClick: () => navigate('/companies') }]
          : []),
        ...(canManageGroups(boot)
          ? [{ icon: Layers, label: 'Manage Groups', hue: 'emerald' as const, onClick: () => navigate('/groups') }]
          : []),
      ],
    },
    {
      title: 'System',
      rows: [
        ...(canManageGroups(boot)
          ? [{ icon: ShieldAlert, label: 'Data Health', hue: 'rose' as const, onClick: () => navigate('/data-health') }]
          : []),
        ...(canManageGroups(boot)
          ? [{ icon: Settings, label: 'Settings', hue: 'slate' as const, onClick: () => navigate('/settings') }]
          : []),
        ...(boot?.roles.includes('System Manager')
          ? [{ icon: UserMinus, label: 'Under-Occupied', hue: 'amber' as const, onClick: () => navigate('/reports/under-occupied') }]
          : []),
      ],
    },
    {
      title: 'App',
      rows: [
        { icon: MessageSquarePlus, label: 'Send feedback', hue: 'violet', onClick: () => navigate('/feedback') },
        { icon: RefreshCw, label: 'Refresh data', hue: 'slate', onClick: refresh },
        { icon: BookOpen, label: 'Replay quick tour', hue: 'slate', onClick: onReplayOnboarding },
      ],
    },
  ]

  return (
    <TabScreen title="Me">
      {boot && (
        <>
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-6 shadow-card">
            {catalog ? (
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

          <PasskeyCard />

          <MyInfoCard employee={boot.employee} leave={boot.leave} />

          {menu.map((section) =>
            section.rows.length === 0 ? null : (
              <div key={section.title} className="mt-4">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
                  {section.title}
                </p>
                <div className="divide-y divide-paper-edge dark:divide-slate-700 overflow-hidden rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 shadow-card">
                  {section.rows.map((r) => (
                    <Row key={r.label} icon={r.icon} label={r.label} hue={r.hue} onClick={r.onClick} />
                  ))}
                </div>
              </div>
            ),
          )}

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

// Shared input style that mirrors the ChangePasswordSheet pattern + paper-* dark tokens.
const INPUT_CLS =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400 focus:bg-white dark:focus:bg-slate-800 placeholder:text-slate-400 dark:placeholder:text-slate-500'

const PROFICIENCIES = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
const EDU_LEVELS = ['SD', 'SMP', 'SMA/SMK', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3']

function MyInfoCard({
  employee,
  leave,
}: {
  employee: EmployeeSoft | null | undefined
  leave: LeaveBalance | null | undefined
}) {
  const toast = useToast()
  const save = useSaveMyProfile()

  const [phone, setPhone] = useState(employee?.phone ?? '')
  const [birthdate, setBirthdate] = useState(employee?.birthdate ?? '')
  const [bio, setBio] = useState(employee?.bio ?? '')
  const [homeAddress, setHomeAddress] = useState(employee?.home_address ?? '')
  const [ecName, setEcName] = useState(employee?.emergency_contact_name ?? '')
  const [ecPhone, setEcPhone] = useState(employee?.emergency_contact_phone ?? '')
  const [ecRelation, setEcRelation] = useState(employee?.emergency_contact_relation ?? '')
  const [skills, setSkills] = useState<EmployeeChildSkill[]>(employee?.skills ?? [])
  const [education, setEducation] = useState<EmployeeChildEducation[]>(employee?.education ?? [])
  const [trainings, setTrainings] = useState<EmployeeChildTraining[]>(employee?.trainings ?? [])

  const doSave = () => {
    save.mutate(
      { phone, birthdate, bio, home_address: homeAddress,
        emergency_contact_name: ecName, emergency_contact_phone: ecPhone, emergency_contact_relation: ecRelation,
        skills, education, trainings },
      {
        onSuccess: () => toast('success', 'Profile saved'),
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not save profile'),
      },
    )
  }

  return (
    <div className="mt-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 shadow-card">
      {/* Header + save button */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <User className="h-4 w-4" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">My Info</p>
        </div>
        <button
          onClick={doSave}
          disabled={save.isPending}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-60"
        >
          {save.isPending && <Spinner className="h-3 w-3" />}
          Save
        </button>
      </div>

      {/* Leave balance — read-only chip */}
      {leave && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-sky-50 dark:bg-sky-500/15 px-3 py-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <span className="text-sm font-semibold text-sky-700 dark:text-sky-300">
            {leave.remaining} / {leave.quota} days leave
          </span>
          <span className="text-xs text-sky-500 dark:text-sky-400">{leave.used} used</span>
        </div>
      )}

      {/* Personal */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Personal</p>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Phone</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            className={INPUT_CLS} placeholder="+62 xxx" />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Birthdate</span>
          <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)}
            className={INPUT_CLS} />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
            className={INPUT_CLS + ' resize-none'} placeholder="Tell your team a bit about you" />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Home Address</span>
          <textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} rows={2}
            className={INPUT_CLS + ' resize-none'} placeholder="Full address" />
        </label>
      </div>

      {/* Emergency Contact */}
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Emergency Contact</p>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          Name
          <input type="text" value={ecName} onChange={(e) => setEcName(e.target.value)}
            className={INPUT_CLS} placeholder="Full name" />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Phone</span>
          <input type="tel" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)}
            className={INPUT_CLS} placeholder="+62 xxx" />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          Relation
          <input type="text" value={ecRelation} onChange={(e) => setEcRelation(e.target.value)}
            className={INPUT_CLS} placeholder="e.g. Spouse, Parent" />
        </label>
      </div>

      {/* Skills */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="h-3.5 w-3.5 text-stone-400 dark:text-slate-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Skills</p>
          </div>
          <button
            type="button"
            onClick={() => setSkills((s) => [...s, { skill: '', proficiency: 'Intermediate' }])}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 active:bg-brand-50 dark:active:bg-brand-500/10"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {skills.length > 0 && (
          <div className="flex flex-col gap-2">
            {skills.map((sk, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text" value={sk.skill}
                  onChange={(e) => setSkills((s) => s.map((x, j) => j === i ? { ...x, skill: e.target.value } : x))}
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400"
                  placeholder="Skill name"
                />
                <select
                  value={sk.proficiency ?? 'Intermediate'}
                  onChange={(e) => setSkills((s) => s.map((x, j) => j === i ? { ...x, proficiency: e.target.value } : x))}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400"
                >
                  {PROFICIENCIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setSkills((s) => s.filter((_, j) => j !== i))}
                  className="rounded-lg p-1.5 text-stone-400 active:bg-rose-50 active:text-rose-600 dark:text-slate-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Education */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-stone-400 dark:text-slate-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Education</p>
          </div>
          <button
            type="button"
            onClick={() => setEducation((s) => [...s, { level: '', institution: '', major: '', year: undefined }])}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 active:bg-brand-50 dark:active:bg-brand-500/10"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {education.length > 0 && (
          <div className="flex flex-col gap-3">
            {education.map((ed, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center gap-2">
                  <select
                    value={ed.level ?? ''}
                    onChange={(e) => setEducation((s) => s.map((x, j) => j === i ? { ...x, level: e.target.value } : x))}
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400"
                  >
                    <option value="">Level</option>
                    {EDU_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setEducation((s) => s.filter((_, j) => j !== i))}
                    className="rounded-lg p-1.5 text-stone-400 active:bg-rose-50 active:text-rose-600 dark:text-slate-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input
                  type="text" value={ed.institution ?? ''}
                  onChange={(e) => setEducation((s) => s.map((x, j) => j === i ? { ...x, institution: e.target.value } : x))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400"
                  placeholder="Institution"
                />
                <div className="flex gap-2">
                  <input
                    type="text" value={ed.major ?? ''}
                    onChange={(e) => setEducation((s) => s.map((x, j) => j === i ? { ...x, major: e.target.value } : x))}
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400"
                    placeholder="Major / Field"
                  />
                  <input
                    type="number" value={ed.year ?? ''}
                    onChange={(e) => setEducation((s) => s.map((x, j) => j === i ? { ...x, year: e.target.value ? Number(e.target.value) : undefined } : x))}
                    className="w-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400"
                    placeholder="Year"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trainings */}
      {/* ponytail: no cert upload in v1; no generic private-upload helper exists for employee docs; add when upload_my_certificate endpoint is ready */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5 text-stone-400 dark:text-slate-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Trainings</p>
          </div>
          <button
            type="button"
            onClick={() => setTrainings((s) => [...s, { title: '' }])}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 active:bg-brand-50 dark:active:bg-brand-500/10"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {trainings.length > 0 && (
          <div className="flex flex-col gap-3">
            {trainings.map((tr, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text" value={tr.title}
                    onChange={(e) => setTrainings((s) => s.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400"
                    placeholder="Training title"
                  />
                  <button
                    type="button"
                    onClick={() => setTrainings((s) => s.filter((_, j) => j !== i))}
                    className="rounded-lg p-1.5 text-stone-400 active:bg-rose-50 active:text-rose-600 dark:text-slate-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input
                  type="text" value={tr.provider ?? ''}
                  onChange={(e) => setTrainings((s) => s.map((x, j) => j === i ? { ...x, provider: e.target.value } : x))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400"
                  placeholder="Provider / organizer"
                />
                <div className="flex gap-2">
                  <label className="flex flex-1 flex-col gap-0.5">
                    <span className="text-xs text-stone-400 dark:text-slate-500">Date</span>
                    <input
                      type="date" value={tr.training_date ?? ''}
                      onChange={(e) => setTrainings((s) => s.map((x, j) => j === i ? { ...x, training_date: e.target.value } : x))}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-0.5">
                    <span className="text-xs text-stone-400 dark:text-slate-500">Expiry</span>
                    <input
                      type="date" value={tr.expiry_date ?? ''}
                      onChange={(e) => setTrainings((s) => s.map((x, j) => j === i ? { ...x, expiry_date: e.target.value } : x))}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
