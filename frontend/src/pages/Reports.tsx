import { useNavigate } from 'react-router-dom'
import { ChevronRight, BarChart3 } from 'lucide-react'
import { TabScreen } from '@/components/Layout'
import { NotificationBell } from '@/components/NotificationBell'
import { REPORTS } from '@/lib/reports'

export default function Reports() {
  const navigate = useNavigate()
  return (
    <TabScreen title="Reports" subtitle="Live data, same as the desk" right={<NotificationBell />}>
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 text-white shadow-card">
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
              className="flex w-full items-center gap-3 rounded-2xl bg-white dark:bg-slate-800 p-4 text-left shadow-card transition active:scale-[0.99]"
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${r.accent} text-white`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{r.title}</p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">{r.desc}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" />
            </button>
          )
        })}
      </div>
    </TabScreen>
  )
}
