import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Settings, Zap, Layers, Sparkles, HeartHandshake, Inbox, Banknote, UserMinus, ChevronRight,
} from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { useBoot } from '@/hooks/useData'

const HUE: Record<string, string> = {
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  slate: 'bg-paper-line text-stone-500 dark:bg-slate-700 dark:text-slate-300',
}

type Row = { icon: LucideIcon; label: string; hue: string; to: string }

// System-Manager-only hub. Moved out of HR Management, grouped into three
// titled sub-sections.
export default function CultureHubScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const isSM = !!boot?.roles.includes('System Manager')

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: 'Configuration',
      rows: [
        { icon: Settings, label: 'Settings', hue: 'slate', to: '/settings' },
        { icon: Zap, label: 'Gamification', hue: 'amber', to: '/gamification-settings' },
        { icon: Layers, label: 'Manage Groups', hue: 'emerald', to: '/groups' },
      ],
    },
    {
      title: 'Recognition',
      rows: [
        { icon: Sparkles, label: 'Superpower', hue: 'violet', to: '/superpower-admin' },
        { icon: HeartHandshake, label: 'Recognition Gate (test)', hue: 'violet', to: '/recognition-test' },
      ],
    },
    {
      title: 'Community',
      rows: [
        { icon: Inbox, label: 'Feedback Inbox', hue: 'sky', to: '/feedback-inbox' },
        { icon: Banknote, label: 'Manage Extra Income', hue: 'emerald', to: '/income-admin' },
        { icon: UserMinus, label: 'Under-Occupied', hue: 'amber', to: '/reports/under-occupied' },
      ],
    },
  ]

  // Not a System Manager → bounce back to the profile menu.
  useEffect(() => {
    if (boot && !isSM) navigate('/me', { replace: true })
  }, [boot, isSM, navigate])

  return (
    <DetailScreen title="Culture Hub">
      {sections.map((s) => (
        <div key={s.title} className="mt-4">
          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
            {s.title}
          </p>
          <div className="divide-y divide-paper-edge dark:divide-slate-700 overflow-hidden rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 shadow-card">
            {s.rows.map((r) => {
              const Icon = r.icon
              return (
                <button
                  key={r.label}
                  onClick={() => navigate(r.to)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-paper-line/50 dark:active:bg-slate-700/50"
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${HUE[r.hue]}`}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex-1 font-medium text-stone-800 dark:text-slate-100">{r.label}</span>
                  <ChevronRight className="h-4 w-4 text-stone-300 dark:text-slate-600" />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </DetailScreen>
  )
}
