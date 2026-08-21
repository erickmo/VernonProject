import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, ArrowUp, Users } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { EmptyState, Spinner } from '@/components/ui'
import { useTeamPriorityCoverage } from '@/hooks/useData'
import { addDaysISO, formatDate, todayISO } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

// Mon-first start of the week containing `iso` (TZ-safe via addDaysISO).
function weekStartOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7 // 0=Mon … 6=Sun
  return addDaysISO(iso, -dow)
}

/**
 * A project leader/owner's whole team, one week at a time: one row per member, a fill
 * count, and a 7-dot strip (dot color = that day's TRUE site-wide priority fill level;
 * a small arrow marks days THIS project itself contributed). Tapping a non-full dot
 * calls `onOpenDate` so the caller can jump to the single-day view. Project picker
 * shown only when the caller leads/owns more than one project.
 */
export function TeamPriorityCoverage({
  candidates,
  onOpenDate,
}: {
  candidates: ProjectItem[]
  onOpenDate: (date: string) => void
}) {
  const projectOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of candidates) if (!m.has(t.project)) m.set(t.project, t.project_name)
    return [...m].map(([value, label]) => ({ value, label }))
  }, [candidates])

  const [projectOverride, setProjectOverride] = useState('')
  const project = projectOverride || projectOptions[0]?.value || ''

  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayISO()))

  const { data, isLoading } = useTeamPriorityCoverage(project, weekStart)

  if (!project) {
    return <EmptyState icon={Users} title="Tidak ada proyek" subtitle="Kamu belum memimpin proyek apa pun." />
  }

  return (
    <div className="space-y-4">
      {projectOptions.length > 1 && (
        <SearchableSelect
          value={project}
          onChange={setProjectOverride}
          options={projectOptions}
          placeholder="Pilih proyek…"
        />
      )}

      {/* Week nav */}
      <div className="flex items-center gap-2 rounded-2xl border border-paper-edge bg-paper-card p-3 shadow-card dark:border-slate-700 dark:bg-slate-800">
        <button
          onClick={() => setWeekStart((w) => addDaysISO(w, -7))}
          aria-label="Minggu sebelumnya"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="flex-1 text-center text-sm font-semibold text-stone-800 dark:text-slate-100">
          {formatDate(weekStart)} – {formatDate(addDaysISO(weekStart, 6))}
        </p>
        <button
          onClick={() => setWeekStart((w) => addDaysISO(w, 7))}
          aria-label="Minggu berikutnya"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {isLoading && !data ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6 text-brand-500" />
        </div>
      ) : !data?.members.length ? (
        <EmptyState icon={Users} title="Tidak ada anggota tim" />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.members.map((m) => {
            const filledDays = m.days.filter((d) => d.slots > 0 && d.used >= d.slots).length
            const allFull = filledDays === 7
            return (
              <li
                key={m.user}
                className="rounded-2xl border border-paper-edge bg-paper-card p-3.5 shadow-card dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-stone-800 dark:text-slate-100">{m.full_name}</p>
                  <span className="shrink-0 text-xs font-semibold text-stone-500 dark:text-slate-400">
                    {filledDays}/7 hari terisi{allFull ? ' ✓' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {m.days.map((d, i) => {
                    const full = d.slots > 0 && d.used >= d.slots
                    const empty = d.used === 0
                    const actionable = !full
                    return (
                      <button
                        key={d.date}
                        onClick={() => actionable && onOpenDate(d.date)}
                        disabled={!actionable}
                        className="flex flex-col items-center gap-1"
                      >
                        <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                          <span
                            className={clsx(
                              'h-3 w-3 rounded-full',
                              full ? 'bg-emerald-500' : empty ? 'bg-stone-300 dark:bg-slate-600' : 'bg-amber-500',
                            )}
                          />
                          {d.contributed && (
                            <ArrowUp className="absolute -top-1.5 h-2.5 w-2.5 text-brand-600 dark:text-brand-400" strokeWidth={3} />
                          )}
                        </span>
                        <span className="text-[10px] font-medium text-stone-400 dark:text-slate-500">{DAY_LABELS[i]}</span>
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
