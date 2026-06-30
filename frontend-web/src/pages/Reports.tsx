import { useNavigate } from 'react-router-dom'
import { ChevronRight, BarChart3 } from 'lucide-react'
import { REPORTS } from '@/lib/reports'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

export default function Reports() {
  const navigate = useNavigate()
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Reports</h1>

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="slate" icon={BarChart3}>
          <BentoStat value={REPORTS.length} label="reports" />
        </BentoTile>

        <BentoTile span="full" tone="plain">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {REPORTS.map((r) => {
              const Icon = r.icon
              return (
                <button
                  key={r.name}
                  onClick={() => navigate(`/report/${encodeURIComponent(r.name)}`)}
                  className="flex w-full items-center gap-3 rounded-lg bg-canvas p-4 text-left transition hover:bg-hover/[0.04]"
                >
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${r.accent} text-white`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{r.title}</p>
                    <p className="truncate text-xs text-muted">{r.desc}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" />
                </button>
              )
            })}
          </div>
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
