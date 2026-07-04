import { useNavigate } from 'react-router-dom'
import { Compass, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { ACTION_GROUPS as GROUPS } from '@/lib/actions'

export default function HelpScreen() {
  const navigate = useNavigate()
  return (
    <DetailScreen title="What can I do">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 shadow-card">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
            <Compass className="h-5 w-5" />
          </div>
          <p className="text-sm text-stone-500 dark:text-slate-400">
            New to Vernon? Here's everything you can do. Tap any card to jump right in.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          {GROUPS.map((g) => (
            <div key={g.title} className="flex flex-col gap-2.5">
              <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                {g.title}
              </h2>
              {g.items.map((it) => (
                <button
                  key={it.title}
                  onClick={() => navigate(it.to)}
                  className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 text-left shadow-card active:scale-[0.99]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                    <it.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-stone-700 dark:text-slate-100">{it.title}</p>
                    <p className="text-xs text-stone-400 dark:text-slate-500">{it.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-stone-300 dark:text-slate-600" />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </DetailScreen>
  )
}
