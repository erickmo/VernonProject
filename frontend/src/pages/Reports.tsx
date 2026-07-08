import { useNavigate } from 'react-router-dom'
import { ChevronRight, BarChart3, Sparkles, AlarmClock, BookOpen } from 'lucide-react'
import { TabScreen } from '@/components/Layout'
import { NotificationBell } from '@/components/NotificationBell'
import { REPORTS } from '@/lib/reports'

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
  const tiles = [
    ...BESPOKE.map((b) => ({
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
