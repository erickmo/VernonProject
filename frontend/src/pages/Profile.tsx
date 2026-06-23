import { useEffect, useState } from 'react'
import { LogOut, Wifi, WifiOff, BookOpen, ShieldCheck, RefreshCw, ChevronRight, Trophy, Store, Users, KeyRound, Settings, Gift, Send } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { TabScreen } from '@/components/Layout'
import { Avatar, FullScreenLoader, Segmented, Spinner } from '@/components/ui'
import { useNavigate } from 'react-router-dom'
import { useBoot, canManageGroups, canManageBrands, canManageUsers, canManageMarketplace, canGrantPoints } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { logout } from '@/lib/api'
import { ChangePasswordSheet } from '@/components/ChangePasswordSheet'
import { type Theme, getStoredTheme, setTheme } from '@/lib/theme'

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
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-card">
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
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-500/15 px-2.5 py-1 text-xs font-medium text-brand-700 dark:text-brand-300"
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
          <div className="mt-3 rounded-2xl bg-white dark:bg-slate-800 px-4 py-3.5 shadow-card">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Appearance
            </p>
            <Segmented options={THEME_OPTIONS} value={theme} onChange={handleThemeChange} />
          </div>

          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card">
            <Row icon={KeyRound} label="Change password" onClick={() => setShowChangePw(true)} />
            <Row icon={Send} label="Gift Points" onClick={() => navigate('/gift-points')} />
            {canManageGroups(boot) && (
              <Row icon={Trophy} label="Manage Groups" onClick={() => navigate('/groups')} />
            )}
            {canManageBrands(boot) && (
              <Row icon={Store} label="Manage Brands" onClick={() => navigate('/brands')} />
            )}
            {canManageUsers(boot) && (
              <Row icon={Users} label="Manage Users" onClick={() => navigate('/users')} />
            )}
            {canManageMarketplace(boot) && (
              <Row icon={Settings} label="Manage Marketplace" onClick={() => navigate('/marketplace-admin')} />
            )}
            {canGrantPoints(boot) && (
              <Row icon={Gift} label="Grant Points" onClick={() => navigate('/grant-points')} />
            )}
            <Row icon={RefreshCw} label="Refresh data" onClick={refresh} />
            <Row icon={BookOpen} label="Replay quick tour" onClick={onReplayOnboarding} />
          </div>

          <a
            href="/app/vernon-project"
            className="mt-3 flex items-center justify-between rounded-2xl bg-white dark:bg-slate-800 px-4 py-3.5 text-sm font-medium text-slate-600 dark:text-slate-300 shadow-card"
          >
            Open full desktop app
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          </a>

          <button
            onClick={doLogout}
            disabled={loggingOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white dark:bg-slate-800 py-3.5 font-semibold text-rose-600 shadow-card active:bg-rose-50 disabled:opacity-60"
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

function Row({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 active:bg-slate-50 dark:active:bg-slate-700/50"
    >
      <Icon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
    </button>
  )
}
