import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { CalendarClock, ShieldAlert, SearchX } from 'lucide-react'
import { Page, PageHeader } from '@web/components/Page'
import { DatePicker } from '@web/components/DatePicker'
import { EmptyState, Spinner } from '@/components/ui'
import { useDailyEstimatedTime, useDailyEstimatedTimeAccess } from '@/hooks/useData'
import { formatEstimate } from '@/lib/format'
import { MAX_RANGE_DAYS, dayLabel, isWeekend, lastDays, rangeBounds, spanDays } from '@/lib/internAllocation'

const RANGES = [7, 14, 30]
const FIELD = 'rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none'
const TH = 'whitespace-nowrap px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted'
// The name column stays put while the day grid scrolls under it.
const STICKY = 'sticky left-0 z-10 bg-surface'

export default function DailyEstimatedTime() {
  const [[from, to], setRange] = useState<[string, string]>(() => lastDays(7))
  const today = lastDays(1)[1]
  const activePreset = to === today ? RANGES.find((d) => spanDays(from, to) === d) ?? null : null
  const bounds = rangeBounds(from, to)
  const { data: access } = useDailyEstimatedTimeAccess()
  const { data, isLoading } = useDailyEstimatedTime(from, to, access?.can_view ?? false)

  const [q, setQ] = useState('')
  // Every active user comes back, so the default view is the one the report answers:
  // who fell under the daily minimum.
  const [onlyFlagged, setOnlyFlagged] = useState(true)

  const rows = data?.rows ?? []
  const dates = data?.dates ?? []
  const flaggedCount = useMemo(() => rows.filter((r) => r.flagged_dates.length > 0).length, [rows])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) =>
      (!onlyFlagged || r.flagged_dates.length > 0) &&
      (!needle || `${r.full_name} ${r.user}`.toLowerCase().includes(needle)))
  }, [rows, q, onlyFlagged])

  if (access && !access.can_view) {
    return (
      <Page>
        <PageHeader icon={CalendarClock} title="Daily Estimated Time" />
        <EmptyState icon={ShieldAlert} title="Akses ditolak" subtitle="Laporan ini hanya untuk System Manager." />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        icon={CalendarClock}
        title="Daily Estimated Time"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>Minimum harian {formatEstimate(data?.threshold ?? 0)}</span>
            <span className="text-line">|</span>
            <span>{flaggedCount} dari {rows.length} anggota di bawah minimum</span>
          </span>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-line bg-surface p-0.5">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRange(lastDays(d))}
              aria-pressed={d === activePreset}
              className={clsx('rounded-lg px-3 py-1.5 text-sm font-medium transition',
                d === activePreset ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink')}
            >
              {d} hari
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-1">
          <DatePicker
            value={from}
            onChange={(v) => v && setRange([v, to])}
            min={bounds.fromMin}
            max={bounds.fromMax}
            aria-label="Tanggal mulai"
            className="px-1.5 py-1 text-sm text-ink"
          />
          <span className="text-muted" aria-hidden>→</span>
          <DatePicker
            value={to}
            onChange={(v) => v && setRange([from, v])}
            min={bounds.toMin}
            max={bounds.toMax}
            aria-label="Tanggal akhir"
            className="px-1.5 py-1 text-sm text-ink"
          />
          <span className="whitespace-nowrap px-1 text-xs text-muted">
            {spanDays(from, to)} hari · maks {MAX_RANGE_DAYS}
          </span>
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
            className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
          />
          Di bawah minimum saja
        </label>

        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari anggota…"
          aria-label="Cari anggota"
          className={`${FIELD} w-52`}
        />
      </div>

      {isLoading && <div className="flex justify-center py-16"><Spinner /></div>}

      {!isLoading && data && shown.length === 0 && (
        <EmptyState
          icon={rows.length ? SearchX : CalendarClock}
          title={rows.length ? 'Tidak ada anggota' : 'Belum ada anggota aktif'}
          subtitle={onlyFlagged && rows.length ? 'Semua anggota memenuhi minimum harian.' : 'Coba ubah pencarian atau rentang tanggal.'}
        />
      )}

      {!isLoading && data && shown.length > 0 && (
        // Only this container scrolls sideways — the page body never does.
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={`${TH} ${STICKY} text-left`}>Anggota</th>
                {dates.map((d) => (
                  <th key={d} className={clsx(TH, 'text-center', isWeekend(d) && 'text-muted/50')} title={dayLabel(d)}>
                    <span className="block leading-tight">{dayLabel(d).split(' ')[0]}</span>
                    <span className="block leading-tight">{d.slice(-2)}</span>
                  </th>
                ))}
                <th className={`${TH} text-center`}>Total</th>
                <th className={`${TH} text-center`}>Di bawah</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const flagged = new Set(r.flagged_dates)
                return (
                  <tr key={r.user} className="border-b border-line/60 last:border-0 hover:bg-canvas">
                    <td className={`${STICKY} px-2 py-2`}>
                      <p className="truncate font-medium text-ink">{r.full_name}</p>
                      <p className="truncate text-xs text-muted">{r.user}</p>
                    </td>
                    {dates.map((d) => {
                      const assigned = r.per_day_assigned[d] ?? 0
                      const planned = r.per_day_planned[d] ?? 0
                      return (
                        <td key={d} className={clsx('px-1 py-1 text-center', isWeekend(d) && 'opacity-60')}>
                          <span
                            title={`${dayLabel(d)} — ${assigned}m teralokasi, ${planned}m direncanakan`}
                            className={clsx(
                              'inline-flex h-8 w-full min-w-11 flex-col items-center justify-center rounded-md text-[11px] font-semibold tabular-nums leading-tight',
                              flagged.has(d) ? 'bg-rose-50 dark:bg-rose-900/30' : 'bg-canvas')}
                          >
                            <span className={flagged.has(d) ? 'text-rose-700 dark:text-rose-300' : 'text-ink'}>{assigned || '·'}</span>
                            <span className="text-muted">{planned || '·'}</span>
                          </span>
                        </td>
                      )
                    })}
                    <td className="px-2 py-2 text-center font-semibold tabular-nums text-ink">{r.assigned_total}</td>
                    <td className={clsx('px-2 py-2 text-center font-semibold tabular-nums',
                      r.flagged_dates.length ? 'text-rose-600 dark:text-rose-400' : 'text-muted')}>
                      {r.flagged_dates.length}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  )
}
