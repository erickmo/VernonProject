import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Pencil, Sparkles, Coins, ChevronRight, CalendarCheck, CalendarOff, ScrollText, Award, ArrowLeftRight, CalendarClock, ShoppingBag, type LucideIcon } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, Avatar } from '@/components/ui'
import { LeaderNotesSection } from '@/components/LeaderNotesSection'
import { useUsers, useEmployeeProfile, useUserPointsLog, useBoot, canManageUsers, canManageAttendance, canHrApprove, canGrantPoints, canManageMarketplace, VERNON_ROLE_OPTIONS } from '@/hooks/useData'

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  VERNON_ROLE_OPTIONS.map((o) => [o.value, o.label]),
)

const MEMBER_BADGE: Record<string, string> = {
  'Internal Team': 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  Intern: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
}

const CHIP: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
  teal: 'bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400',
  cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
  fuchsia: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400',
}

export default function UserDashboardScreen() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const { data: users, isLoading } = useUsers()
  const user = useMemo(() => users?.find((u) => u.name === name), [users, name])
  const { data: profile } = useEmployeeProfile(name ?? '', !!name)
  const { data: pointsLog } = useUserPointsLog(name)

  useEffect(() => {
    if (!bootLoading && !canManageUsers(boot)) navigate('/', { replace: true })
  }, [bootLoading, boot, navigate])

  if (bootLoading || isLoading) {
    return (
      <DetailScreen title="User" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }
  if (!canManageUsers(boot)) return null
  if (!user) {
    return (
      <DetailScreen title="User" right={null}>
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">User not found.</p>
      </DetailScreen>
    )
  }

  const u = user
  const enc = encodeURIComponent(u.name)
  const leave = profile?.leave
  const emp = profile

  // Grouped per-user menu; each item gated by the viewer's capability, empty groups drop out.
  type MenuItem = { to: string; icon: LucideIcon; label: string; desc: string; accent: string; show: boolean }
  const groups: { title: string; items: MenuItem[] }[] = [
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
        { to: `/u/${enc}/points`, icon: Coins, label: 'Points log', desc: 'Riwayat poin diperoleh', accent: 'amber', show: true },
        { to: `/grant-points?user=${enc}`, icon: Award, label: 'Grant points', desc: 'Beri poin ke pengguna ini', accent: 'indigo', show: canGrantPoints(boot) },
        { to: `/marketplace-admin?user=${enc}`, icon: ShoppingBag, label: 'Redemptions', desc: 'Riwayat penukaran poin (spend)', accent: 'fuchsia', show: canManageMarketplace(boot) },
      ],
    },
    {
      title: 'Attendance & leave',
      items: [
        { to: `/attendance/manage/report?user=${enc}`, icon: CalendarCheck, label: 'Attendance', desc: 'Kehadiran, keterlambatan & penalti', accent: 'emerald', show: canManageAttendance(boot) },
        { to: `/attendance/manage/assignments?user=${enc}`, icon: CalendarClock, label: 'Shift schedule', desc: 'Penugasan shift & menit minimum', accent: 'cyan', show: canManageAttendance(boot) },
        { to: `/cuti-ledger-admin?user=${enc}`, icon: CalendarOff, label: 'Leave / cuti', desc: 'Saldo, riwayat & penyesuaian cuti', accent: 'rose', show: canHrApprove(boot) },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((it) => it.show) }))
    .filter((g) => g.items.length > 0)

  return (
    <DetailScreen
      title="User"
      right={
        <button
          onClick={() => navigate(`/users/${enc}/edit`)}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Pencil className="h-4 w-4" /> Edit
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Identity card */}
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-800 dark:border-slate-700">
          <div className="shrink-0 rounded-full ring-2 ring-sky-200 dark:ring-sky-500/30">
            <Avatar name={u.full_name || u.name} image={u.user_image} config={u.avatar_config} size={48} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-slate-800 dark:text-slate-100">{u.full_name || u.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.name}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  u.enabled
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}
              >
                {u.enabled ? 'Active' : 'Disabled'}
              </span>
              {u.member_type && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${MEMBER_BADGE[u.member_type] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                  {u.member_type}
                </span>
              )}
              {u.roles.map((r) => (
                <span key={r} className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                  {ROLE_LABEL[r] ?? r}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Leave + employment */}
        {(leave || pointsLog || emp?.job_title || emp?.employment_status || emp?.date_joined) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:bg-slate-800 dark:border-slate-700">
            {(leave || pointsLog) && (
              <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                {leave && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{leave.remaining}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">/ {leave.quota} sisa cuti tahun ini</span>
                  </span>
                )}
                {pointsLog && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{pointsLog.total_earned}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">poin diperoleh</span>
                  </span>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Info label="Job title" value={emp?.job_title} />
              <Info label="Status" value={emp?.employment_status} />
              <Info label="Date joined" value={emp?.date_joined} />
              <Info label="Contract" value={emp?.contract_start ? `${emp.contract_start}${emp.contract_end ? ` → ${emp.contract_end}` : ''}` : undefined} />
            </div>
          </div>
        )}

        {/* Related menu, grouped */}
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{g.title}</h3>
              <div className="flex flex-col gap-2">
                {g.items.map((l) => (
                  <button
                    key={l.to}
                    onClick={() => navigate(l.to)}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left active:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:active:bg-slate-700/50"
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${CHIP[l.accent]}`}>
                      <l.icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{l.label}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{l.desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <LeaderNotesSection user={u.name} />
      </div>
    </DetailScreen>
  )
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="block text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-800 dark:text-slate-100">{value || '—'}</span>
    </div>
  )
}
