import { useEffect, useState } from 'react'
import { LogOut, Wifi, WifiOff, BookOpen, ShieldCheck, RefreshCw, ChevronRight, Trophy, Store } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { TabScreen } from '@/components/Layout'
import { Avatar, FullScreenLoader, Spinner } from '@/components/ui'
import { useNavigate } from 'react-router-dom'
import { useBoot, canManageGroups, canManageBrands } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { logout } from '@/lib/api'

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

export default function Profile({ onReplayOnboarding }: { onReplayOnboarding: () => void }) {
  const { data: boot, isLoading } = useBoot()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const online = useOnline()
  const [loggingOut, setLoggingOut] = useState(false)

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

  return (
    <TabScreen title="Me">
      {boot && (
        <>
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-card">
            <Avatar name={boot.full_name} image={boot.image} size={72} />
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900">{boot.full_name}</p>
              <p className="text-sm text-slate-400">{boot.user}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {boot.roles.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
                >
                  <ShieldCheck className="h-3 w-3" />
                  {r}
                </span>
              ))}
            </div>
          </div>

          <div
            className={`mt-3 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium ${
              online ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {online ? 'Online — synced with server' : 'Offline — showing saved data'}
          </div>

          <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-card">
            {canManageGroups(boot) && (
              <Row icon={Trophy} label="Manage Groups" onClick={() => navigate('/groups')} />
            )}
            {canManageBrands(boot) && (
              <Row icon={Store} label="Manage Brands" onClick={() => navigate('/brands')} />
            )}
            <Row icon={RefreshCw} label="Refresh data" onClick={refresh} />
            <Row icon={BookOpen} label="Replay quick tour" onClick={onReplayOnboarding} />
          </div>

          <a
            href="/app/vernon-project"
            className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 text-sm font-medium text-slate-600 shadow-card"
          >
            Open full desktop app
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </a>

          <button
            onClick={doLogout}
            disabled={loggingOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 font-semibold text-rose-600 shadow-card active:bg-rose-50 disabled:opacity-60"
          >
            {loggingOut ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <>
                <LogOut className="h-4 w-4" /> Log out
              </>
            )}
          </button>

          <p className="mt-6 text-center text-xs text-slate-300">Vernon Project · Mobile v1.0</p>
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
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-slate-700 active:bg-slate-50"
    >
      <Icon className="h-5 w-5 text-slate-400" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-slate-300" />
    </button>
  )
}
