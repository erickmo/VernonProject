import { useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Sparkles, Coins, ChevronRight, Briefcase, CalendarCheck, CalendarOff,
  ScrollText, Award, ArrowLeftRight, CalendarClock, ShoppingBag,
} from 'lucide-react'
import { Spinner, Avatar } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import LeaderNotesSection from '@web/components/LeaderNotesSection'
import { useUsers, useEmployeeProfile, useUserPointsLog, useBoot, canManageUsers, canManageAttendance, canHrApprove, canGrantPoints, canManageMarketplace, VERNON_ROLE_OPTIONS } from '@/hooks/useData'

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  VERNON_ROLE_OPTIONS.map((o) => [o.value, o.label]),
)

const MEMBER_BADGE: Record<string, string> = {
  'Internal Team': 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  Intern: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
}

const CHIP: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
  teal: 'bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300',
  cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300',
  fuchsia: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
}

export default function UserDashboard() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const { data: users, isLoading, isError, refetch } = useUsers()
  const user = useMemo(() => users?.find((u) => u.name === name), [users, name])
  const { data: profile } = useEmployeeProfile(name ?? '', !!name)
  const { data: pointsLog } = useUserPointsLog(name)

  // Same gate as the Users list — this whole area is System-Manager only.
  const blocked = !!boot && !canManageUsers(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (bootLoading || isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }
  if (blocked) return null
  if (isError) return <ErrorState onRetry={() => refetch()} />
  if (!user) {
    return (
      <ErrorState
        title="Not found"
        subtitle="This user could not be found. They may have been removed."
        onRetry={() => navigate('/users')}
      />
    )
  }

  const u = user
  const enc = encodeURIComponent(u.name)
  const leave = profile?.leave
  const emp = profile

  // Per-user menu — each surface gated by the viewer's capability for it.
  // Grouped per-user menu; each item gated by the viewer's capability, empty groups drop out.
  const groups = [
    {
      title: 'Account',
      items: [
        { to: `/users/${enc}/edit`, icon: Pencil, label: 'Edit profile', desc: 'Identity, roles, contract, leave & account', accent: 'brand', show: true },
        { to: `/superpowers/${enc}`, icon: Sparkles, label: 'Superpowers', desc: 'Skills & endorsements', accent: 'violet', show: true },
      ],
    },
    {
      title: 'Work',
      items: [
        { to: `/logbook?user=${enc}`, icon: ScrollText, label: 'Activity log', desc: 'Riwayat tugas yang diselesaikan', accent: 'sky', show: true },
        { to: `/transfer-tasks?user=${enc}`, icon: ArrowLeftRight, label: 'Transfer tasks', desc: 'Pindahkan tugas dari pengguna ini', accent: 'teal', show: canManageUsers(boot) },
      ],
    },
    {
      title: 'Points & rewards',
      items: [
        { to: `/points-log/${enc}`, icon: Coins, label: 'Points log', desc: 'Riwayat poin diperoleh', accent: 'amber', show: true },
        { to: `/grant-points?user=${enc}`, icon: Award, label: 'Grant points', desc: 'Beri poin ke pengguna ini', accent: 'indigo', show: canGrantPoints(boot) },
        { to: `/marketplace-admin?user=${enc}`, icon: ShoppingBag, label: 'Redemptions', desc: 'Riwayat penukaran poin (spend)', accent: 'fuchsia', show: canManageMarketplace(boot) },
      ],
    },
    {
      title: 'Attendance & leave',
      items: [
        { to: `/attendance-report?user=${enc}`, icon: CalendarCheck, label: 'Attendance', desc: 'Kehadiran, keterlambatan & penalti', accent: 'emerald', show: canManageAttendance(boot) },
        { to: `/attendance/assignments?user=${enc}`, icon: CalendarClock, label: 'Shift schedule', desc: 'Penugasan shift & menit minimum', accent: 'cyan', show: canManageAttendance(boot) },
        { to: `/attendance/cuti-admin?user=${enc}`, icon: CalendarOff, label: 'Leave / cuti', desc: 'Saldo, riwayat & penyesuaian cuti', accent: 'rose', show: canHrApprove(boot) },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((it) => it.show) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate('/users')}
            className="mb-2 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Users
          </button>
          <div className="flex items-center gap-4">
            <Avatar name={u.full_name || u.name} image={u.user_image ?? undefined} config={u.avatar_config} size={56} />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{u.full_name || u.name}</h1>
              <p className="truncate text-sm text-muted">{u.name}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    u.enabled
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-surface text-muted'
                  }`}
                >
                  {u.enabled ? 'Active' : 'Disabled'}
                </span>
                {u.member_type && (
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${MEMBER_BADGE[u.member_type] ?? 'bg-surface text-muted'}`}>
                    {u.member_type}
                  </span>
                )}
                {u.roles.map((r) => (
                  <span key={r} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                    {ROLE_LABEL[r] ?? r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(`/superpowers/${enc}`)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-hover/[0.04] dark:border-slate-700"
          >
            <Sparkles className="h-4 w-4 text-brand-600" /> Superpower
          </button>
          <button
            type="button"
            onClick={() => navigate(`/users/${enc}/edit`)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      </div>

      <BentoGrid>
        {/* Leave stat */}
        {leave && (
          <BentoTile span="sm" tone="tint" accent="rose">
            <BentoStat
              value={leave.remaining}
              label="days leave left"
              delta={`of ${leave.quota} this year${leave.used ? ` · ${leave.used} used` : ''}`}
            />
          </BentoTile>
        )}

        {pointsLog && (
          <BentoTile span="sm" tone="tint" accent="amber">
            <BentoStat value={pointsLog.total_earned} label="points earned" />
          </BentoTile>
        )}

        {/* Employment */}
        <BentoTile span="md" tone="plain" title="Employment">
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Info label="Job title" value={emp?.job_title} icon={Briefcase} />
            <Info label="Status" value={emp?.employment_status} />
            <Info label="Date joined" value={emp?.date_joined} />
            <Info label="Contract" value={emp?.contract_start ? `${emp.contract_start}${emp.contract_end ? ` → ${emp.contract_end}` : ''}` : undefined} />
          </div>
        </BentoTile>

        {/* Related menu, grouped */}
        <BentoTile span="full" tone="plain" title="Related">
          <div className="mt-1 space-y-5">
            {groups.map((g) => (
              <div key={g.title}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {g.items.map((l) => (
                    <Link
                      key={l.to}
                      to={l.to}
                      className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:bg-hover/[0.04] dark:border-slate-700"
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${CHIP[l.accent]}`}>
                        <l.icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{l.label}</p>
                        <p className="truncate text-xs text-muted">{l.desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-brand-600" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </BentoTile>
      </BentoGrid>

      <LeaderNotesSection user={u.name} />
    </div>
  )
}

function Info({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: typeof Briefcase }) {
  return (
    <div>
      <span className="text-xs text-muted">{label}</span>
      <p className="flex items-center gap-1.5 font-medium text-ink">
        {Icon && value && <Icon className="h-3.5 w-3.5 text-muted" />}
        {value || '—'}
      </p>
    </div>
  )
}
