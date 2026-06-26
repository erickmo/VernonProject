import { useEffect, useState } from 'react'
import { LogOut, Wifi, WifiOff, BookOpen, ShieldCheck, RefreshCw, ChevronRight, Layers, Store, Users, KeyRound, Settings, Gift, Send, Award, Bell, BellOff, ShieldAlert } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { TabScreen } from '@/components/Layout'
import { Avatar, FullScreenLoader, Segmented, Spinner } from '@/components/ui'
import { useNavigate } from 'react-router-dom'
import { useBoot, canManageGroups, canManageBrands, canManageUsers, canManageMarketplace, canGrantPoints, canManageBadges } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { logout } from '@/lib/api'
import { ChangePasswordSheet } from '@/components/ChangePasswordSheet'
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
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const online = useOnline()
  const [loggingOut, setLoggingOut] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    getPushSubscription().then((s) => setPushOn(!!s))
  }, [])

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

  return (
    <TabScreen title="Me">
      {boot && (
        <>
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
            <Avatar name={boot.full_name} image={boot.image} size={72} />
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900 dark:text-slate-50">{boot.full_name}</p>
              <p className="text-sm text-slate-400 dark:text-slate-500">{boot.user}</p>
            </div>
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

          {/* Appearance */}
          <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3.5 shadow-sm">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Appearance
            </p>
            <Segmented options={THEME_OPTIONS} value={theme} onChange={handleThemeChange} />
          </div>

          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
            {pushSupported() && (
              <Row
                icon={pushOn ? Bell : BellOff}
                label={pushBusy ? 'Working…' : pushOn ? 'Notifications: On' : 'Enable notifications'}
                hue="sky"
                onClick={togglePush}
              />
            )}
            <Row icon={KeyRound} label="Change password" hue="sky" onClick={() => setShowChangePw(true)} />
            <Row icon={Send} label="Gift Points" hue="amber" onClick={() => navigate('/gift-points')} />
            {canManageGroups(boot) && (
              <Row icon={Layers} label="Manage Groups" hue="emerald" onClick={() => navigate('/groups')} />
            )}
            {canManageGroups(boot) && (
              <Row icon={ShieldAlert} label="Data Health" hue="rose" onClick={() => navigate('/data-health')} />
            )}
            {canManageBrands(boot) && (
              <Row icon={Store} label="Manage Brands" hue="pink" onClick={() => navigate('/brands')} />
            )}
            {canManageUsers(boot) && (
              <Row icon={Users} label="Manage Users" hue="sky" onClick={() => navigate('/users')} />
            )}
            {canManageBadges(boot) && (
              <Row icon={Award} label="Manage Badges" hue="violet" onClick={() => navigate('/badge-settings')} />
            )}
            {canManageMarketplace(boot) && (
              <Row icon={Settings} label="Manage Marketplace" hue="amber" onClick={() => navigate('/marketplace-admin')} />
            )}
            {canGrantPoints(boot) && (
              <Row icon={Gift} label="Grant Points" hue="amber" onClick={() => navigate('/grant-points')} />
            )}
            <Row icon={RefreshCw} label="Refresh data" hue="slate" onClick={refresh} />
            <Row icon={BookOpen} label="Replay quick tour" hue="slate" onClick={onReplayOnboarding} />
          </div>

          <a
            href="/app/vernon-project"
            className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3.5 text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm"
          >
            Open full desktop app
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          </a>

          <button
            onClick={doLogout}
            disabled={loggingOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-3.5 font-semibold text-rose-600 shadow-sm active:bg-rose-50 disabled:opacity-60"
          >
            {loggingOut ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <>
                <LogOut className="h-4 w-4" /> Log out
              </>
            )}
          </button>

          <p className="mt-6 text-center text-xs text-slate-300 dark:text-slate-600">Vernon Project · Mobile v1.0</p>

          <ChangePasswordSheet open={showChangePw} onClose={() => setShowChangePw(false)} />
        </>
      )}
    </TabScreen>
  )
}

const ROW_HUE: Record<string, string> = {
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  pink: 'bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  slate: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
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
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 active:bg-slate-50 dark:active:bg-slate-700/50"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ROW_HUE[hue]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
    </button>
  )
}
