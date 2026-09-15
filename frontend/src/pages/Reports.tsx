import { useNavigate } from 'react-router-dom'
import { ChevronRight, BarChart3, Sparkles, AlarmClock, BookOpen, UserRoundCheck, GraduationCap, Users, UserMinus, UserPlus, CalendarClock } from 'lucide-react'
import { TabScreen } from '@/components/Layout'
import { NotificationBell } from '@/components/NotificationBell'
import { REPORTS } from '@/lib/reports'
import { useBoot, useLastSeenAccess, useInternAllocationAccess, useTeamDailyReportAccess, useDailyEstimatedTimeAccess } from '@/hooks/useData'

// Bespoke reports with their own screens (not the generic /report/:name engine).
const BESPOKE = [
  {
    key: 'todos-due',
    title: 'Todos Due',
    desc: 'Open todos to chase across projects you own, lead, or admin',
    icon: AlarmClock,
    accent: 'from-rose-500 to-pink-600',
    to: '/reports/todos-due',
  },
  {
    key: 'logbook',
    title: 'Logbook',
    desc: 'Daily plan & completion log with performance summary and PDF export',
    icon: BookOpen,
    accent: 'from-brand-500 to-indigo-600',
    to: '/logbook',
  },
]

export default function Reports() {
  const navigate = useNavigate()
  const { data: lastSeenAccess } = useLastSeenAccess()
  const { data: internAccess } = useInternAllocationAccess()
  const { data: teamDailyAccess } = useTeamDailyReportAccess()
  const { data: dailyTimeAccess } = useDailyEstimatedTimeAccess()
  const { data: boot } = useBoot()
  // The two occupancy reports are System-Manager-only server-side and have no
  // access endpoint of their own, so the role from boot is the gate.
  const isSystemManager = !!boot?.roles.includes('System Manager')
  const bespoke = [
    ...(isSystemManager
      ? [{
          key: 'under-occupied',
          title: 'Under-Occupied',
          desc: 'Anggota yang tugas hariannya di bawah target shift',
          icon: UserMinus,
          accent: 'from-amber-500 to-yellow-600',
          to: '/reports/under-occupied',
        }, {
          key: 'over-occupied',
          title: 'Over-Occupied',
          desc: 'Anggota yang tugas hariannya melebihi target shift',
          icon: UserPlus,
          accent: 'from-rose-500 to-red-600',
          to: '/reports/over-occupied',
        }]
      : []),
    ...(dailyTimeAccess?.can_view
      ? [{
          key: 'daily-estimated-time',
          title: 'Daily Estimated Time',
          desc: 'Menit teralokasi per orang per hari, menandai hari di bawah minimum',
          icon: CalendarClock,
          accent: 'from-violet-500 to-purple-600',
          to: '/reports/daily-estimated-time',
        }]
      : []),
    ...(internAccess?.can
      ? [{
          key: 'intern-allocation',
          title: 'Employee Allocation',
          desc: 'Matriks tugas magang per hari + sinyal pengelolaan pemimpin',
          icon: GraduationCap,
          accent: 'from-amber-500 to-orange-600',
          to: '/reports/intern-allocation',
        }]
      : []),
    ...(teamDailyAccess?.can
      ? [{
          key: 'team-daily',
          title: 'Team Daily Report',
          desc: 'Menit ditugaskan vs selesai per anggota per hari, lintas semua proyek',
          icon: Users,
          accent: 'from-sky-500 to-blue-600',
          to: '/reports/team-daily',
        }]
      : []),
    ...(lastSeenAccess?.can
      ? [{
          key: 'last-seen',
          title: 'Last Seen',
          desc: 'When each teammate was last active',
          icon: UserRoundCheck,
          accent: 'from-emerald-500 to-teal-600',
          to: '/reports/last-seen',
        }]
      : []),
    ...BESPOKE,
  ]
  const tiles = [
    ...bespoke.map((b) => ({
      key: b.key, title: b.title, desc: b.desc, icon: b.icon, accent: b.accent,
      go: () => navigate(b.to),
    })),
    ...REPORTS.map((r) => ({
      key: r.name, title: r.title, desc: r.desc, icon: r.icon, accent: r.accent,
      go: () => navigate(`/report/${encodeURIComponent(r.name)}`),
    })),
  ]
  return (
    <TabScreen title="Reports" subtitle="Live data, same as the desk" right={<NotificationBell />}>
      <div className="relative mb-4 flex items-center gap-3 overflow-hidden rounded-2xl bg-slate-900 border border-slate-700/50 p-4 text-white shadow-card">
        <Sparkles aria-hidden strokeWidth={2.25} className="pointer-events-none absolute right-4 top-4 h-6 w-6 animate-float text-amber-200" />
        <BarChart3 className="h-7 w-7 shrink-0 text-brand-300" />
        <p className="text-sm leading-snug text-slate-200">
          Run project reports on the go. Tap one, set the filters, and see results instantly.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {tiles.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={t.go}
              className="flex w-full items-center gap-3 rounded-2xl bg-paper-card dark:bg-slate-800 border border-paper-edge dark:border-slate-700 p-4 text-left shadow-card transition active:scale-[0.99]"
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${t.accent} text-white`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-800 dark:text-slate-100">{t.title}</p>
                <p className="truncate text-xs text-stone-400 dark:text-slate-500">{t.desc}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-stone-300 dark:text-slate-600" />
            </button>
          )
        })}
      </div>
    </TabScreen>
  )
}
