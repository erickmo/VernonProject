import { useNavigate } from 'react-router-dom'
import { ChevronRight, BarChart3, Sparkles } from 'lucide-react'
import { TabScreen } from '@/components/Layout'
import { NotificationBell } from '@/components/NotificationBell'
import { REPORTS } from '@/lib/reports'

export default function Reports() {
  const navigate = useNavigate()
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
        {REPORTS.map((r) => {
          const Icon = r.icon
          return (
            <button
              key={r.name}
              onClick={() => navigate(`/report/${encodeURIComponent(r.name)}`)}
              className="flex w-full items-center gap-3 rounded-2xl bg-paper-card dark:bg-slate-800 border border-paper-edge dark:border-slate-700 p-4 text-left shadow-card transition active:scale-[0.99]"
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${r.accent} text-white`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-800 dark:text-slate-100">{r.title}</p>
                <p className="truncate text-xs text-stone-400 dark:text-slate-500">{r.desc}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-stone-300 dark:text-slate-600" />
            </button>
          )
        })}
      </div>
    </TabScreen>
  )
}
