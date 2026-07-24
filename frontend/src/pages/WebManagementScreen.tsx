import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { Megaphone, BookOpen, Globe, Boxes, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { useBoot, canManageRecruitment, canManageBusinessUnits } from '@/hooks/useData'

const HUE: Record<string, string> = {
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
}

// `href` = off-app / external destination (a Frappe www page or another origin);
// opened in a new tab via window.open instead of in-app navigate().
type Row = { icon: LucideIcon; label: string; hue: string; to?: string; href?: string }

// Manage VernonCorp's public web: the careers/recruitment funnel plus quick-links
// out to the live public properties. Mirrors the /w "Web Management" nav group.
export default function WebManagementScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const rows: Row[] = [
    ...(canManageBusinessUnits(boot) ? [{ icon: Boxes, label: 'Manage Business Units', hue: 'indigo', to: '/business-units' }] : []),
    ...(canManageRecruitment(boot) ? [
      { icon: Megaphone, label: 'Halaman Karier ↗', hue: 'amber', href: '/careers' },
      { icon: BookOpen, label: 'Dokumentasi ↗', hue: 'indigo', href: '/docs' },
      { icon: Globe, label: 'Situs Publik ↗', hue: 'emerald', href: 'https://project-www.vernon.id' },
    ] : []),
  ]

  useEffect(() => {
    if (boot && !rows.length) navigate('/me', { replace: true })
  }, [boot, rows.length, navigate])

  return (
    <DetailScreen title="Web Management">
      <div className="mt-4 divide-y divide-paper-edge dark:divide-slate-700 overflow-hidden rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 shadow-card">
        {rows.map((r) => {
          const Icon = r.icon
          return (
            <button
              key={r.label}
              onClick={() => (r.href ? window.open(r.href, '_blank', 'noopener') : navigate(r.to!))}
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
    </DetailScreen>
  )
}
