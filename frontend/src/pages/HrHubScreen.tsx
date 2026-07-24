import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Users, ArrowLeftRight, Briefcase, FileText, Ban, ClipboardList, ClipboardCheck,
  Building2, Store, BookOpen, DoorOpen, ShieldAlert, ChevronRight, Copy,
} from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import {
  useBoot, canManageUsers, canManageAttendance, canManageRecruitment,
  canManageCompanies, canManageBrands,
  canManageLms, canManageGroups, canManageResources,
} from '@/hooks/useData'

const HUE: Record<string, string> = {
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  pink: 'bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
  slate: 'bg-paper-line text-stone-500 dark:bg-slate-700 dark:text-slate-300',
}

type Row = { icon: LucideIcon; label: string; hue: string; to?: string; href?: string }

export default function HrHubScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: 'People',
      rows: [
        ...(canManageUsers(boot) ? [{ icon: Users, label: 'Manage Users', hue: 'sky', to: '/users' }] : []),
        ...(canManageUsers(boot) ? [{ icon: ArrowLeftRight, label: 'Transfer Tasks', hue: 'sky', to: '/transfer-tasks' }] : []),
        ...(canManageUsers(boot) ? [{ icon: Copy, label: 'Salin Keanggotaan Proyek', hue: 'sky', to: '/clone-memberships' }] : []),
      ],
    },
    {
      title: 'Recruitment',
      rows: [
        ...(canManageRecruitment(boot) ? [{ icon: Briefcase, label: 'Kelola Lowongan', hue: 'indigo', to: '/recruitment/openings' }] : []),
        ...(canManageRecruitment(boot) ? [{ icon: FileText, label: 'Lamaran Masuk', hue: 'sky', to: '/recruitment/applications' }] : []),
        ...(canManageRecruitment(boot) ? [{ icon: Ban, label: 'Blacklist KTP', hue: 'rose', to: '/recruitment/blacklist' }] : []),
        ...(canManageRecruitment(boot) ? [{ icon: ClipboardCheck, label: 'Coba Tes ↗', hue: 'violet', href: '/apply?preview=1' }] : []),
      ],
    },
    {
      title: 'Attendance',
      rows: [
        ...(canManageAttendance(boot) ? [{ icon: ClipboardList, label: 'Manage attendance', hue: 'emerald', to: '/attendance/manage' }] : []),
      ],
    },
    {
      title: 'Organization',
      rows: [
        ...(canManageCompanies(boot) ? [{ icon: Building2, label: 'Manage Companies', hue: 'sky', to: '/companies' }] : []),
        ...(canManageBrands(boot) ? [{ icon: Store, label: 'Manage Brands', hue: 'pink', to: '/brands' }] : []),
      ],
    },
    {
      title: 'Other',
      rows: [
        ...(canManageLms(boot) ? [{ icon: BookOpen, label: 'Manage Learning', hue: 'indigo', to: '/learn-admin' }] : []),
        ...(canManageResources(boot) ? [{ icon: DoorOpen, label: 'Resources', hue: 'indigo', to: '/meeting-rooms' }] : []),
        ...(canManageGroups(boot) ? [{ icon: ShieldAlert, label: 'Data Health', hue: 'rose', to: '/data-health' }] : []),
      ],
    },
  ].filter((s) => s.rows.length > 0)

  // No admin access at all → bounce back to the profile menu.
  useEffect(() => {
    if (boot && sections.length === 0) navigate('/me', { replace: true })
  }, [boot, sections.length, navigate])

  return (
    <DetailScreen title="HR Management">
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
        </div>
      ))}
    </DetailScreen>
  )
}
