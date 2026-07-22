import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, UserCheck, CalendarClock, UserCog, Monitor, Inbox, CalendarDays, BarChart3 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { useBoot, canManageAttendance } from '@/hooks/useData'

const ITEMS: { to: string; label: string; desc: string; icon: React.ComponentType<{ className?: string }>; accent: string }[] = [
  { to: '/attendance/manage/enrolled', label: 'Enrolled employees', desc: 'Enrol people, set their brand', icon: UserCheck, accent: 'from-emerald-400 to-emerald-600' },
  { to: '/attendance/manage/templates', label: 'Shift templates', desc: 'Jam kerja & menit minimum per peran', icon: CalendarClock, accent: 'from-brand-400 to-brand-600' },
  { to: '/attendance/manage/assignments', label: 'Penugasan shift', desc: 'Tugaskan karyawan ke shift', icon: UserCog, accent: 'from-indigo-400 to-indigo-600' },
  { to: '/attendance/manage/stations', label: 'Stations', desc: 'Scan points + kiosk QR', icon: Monitor, accent: 'from-sky-400 to-sky-600' },
  { to: '/attendance/manage/exceptions', label: 'Leave / WFH', desc: 'Approve requests', icon: Inbox, accent: 'from-amber-400 to-amber-600' },
  { to: '/attendance/manage/holidays', label: 'Holidays', desc: 'Per-brand holiday lists', icon: CalendarDays, accent: 'from-violet-400 to-violet-600' },
  { to: '/attendance/manage/report', label: 'Report', desc: 'Daily attendance + penalties', icon: BarChart3, accent: 'from-rose-400 to-rose-600' },
]

export default function AttendanceAdminScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (blocked) return null

  return (
    <DetailScreen title="Manage attendance">
      <div className="flex flex-col gap-2.5">
        {ITEMS.map((it) => {
          const Icon = it.icon
          return (
            <button
              key={it.to}
              onClick={() => navigate(it.to)}
              className="flex w-full items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card p-4 text-left shadow-card transition active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800"
            >
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${it.accent} text-white`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-800 dark:text-slate-100">{it.label}</p>
                <p className="truncate text-xs text-stone-400 dark:text-slate-500">{it.desc}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-stone-300 dark:text-slate-600" />
            </button>
          )
        })}
      </div>
    </DetailScreen>
  )
}
