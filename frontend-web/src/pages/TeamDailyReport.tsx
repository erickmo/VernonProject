import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Users, AlertTriangle, SearchX } from 'lucide-react'
import { Page, PageHeader } from '@web/components/Page'
import { DatePicker } from '@web/components/DatePicker'
import { EmptyState, Spinner } from '@/components/ui'
import { useTeamDailyReport, useTeamDailyReportAccess } from '@/hooks/useData'
import { MAX_RANGE_DAYS, dayLabel, isWeekend, lastDays, rangeBounds, spanDays } from '@/lib/internAllocation'

const RANGES = [7, 14, 30]

const FIELD = 'rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none'
const TH = 'whitespace-nowrap px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted'
// The name column stays put while the day grid scrolls under it.
const STICKY = 'sticky left-0 z-10 bg-surface'

export default function TeamDailyReport() {
  const [[from, to], setRange] = useState<[string, string]>(() => lastDays(14))
  const today = lastDays(1)[1]
  const activePreset = to === today ? RANGES.find((d) => spanDays(from, to) === d) ?? null : null
  const bounds = rangeBounds(from, to)
  const { data: access } = useTeamDailyReportAccess()
  const { data, isLoading, isError, error, refetch } = useTeamDailyReport(from, to, undefined, access?.can ?? false)

  const [q, setQ] = useState('')
  const rows = data?.rows ?? []
  const dates = data?.dates ?? []
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => `${r.full_name} ${r.user}`.toLowerCase().includes(needle))
  }, [rows, q])
  const errMsg = String((error as Error)?.message ?? '')
  const denied = access ? !access.can : (isError && /permission|not permitted/i.test(errMsg))
  const failed = isError && !denied

  if (denied) {
    return (
      <Page>
        <PageHeader icon={Users} title="Team Daily Report" />
        <EmptyState icon={Users} title="Tidak ada akses" subtitle="Laporan ini untuk tim HR dan pemimpin proyek." />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        icon={Users}
        title="Team Daily Report"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <span>{data?.totals.assigned ?? 0} menit ditugaskan</span>
            <span className="text-line">|</span>
            <span>{data?.totals.done ?? 0} menit selesai</span>
            <span className="text-line">|</span>
            <span>{data?.scope === 'team' ? 'Anggota di proyek yang Anda pegang' : 'Seluruh anggota'}</span>
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

      {failed && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="font-semibold text-ink">Gagal memuat laporan</p>
          <p className="max-w-md text-sm text-muted">{errMsg || 'Coba lagi sebentar.'}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Coba lagi
          </button>
        </div>
      )}

      {!isLoading && !failed && shown.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="Tidak ada anggota"
          subtitle={rows.length ? 'Tidak ada yang cocok dengan pencarian ini.' : 'Belum ada anggota tim yang terlihat.'}
        />
      )}

      {!isLoading && !failed && shown.length > 0 && (
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
                <th className={`${TH} text-center`}>Ditugaskan</th>
                <th className={`${TH} text-center`}>Selesai</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.user} className="border-b border-line/60 last:border-0 hover:bg-canvas">
                  <td className={`${STICKY} px-2 py-2`}>
                    <p className="truncate font-medium text-ink">{r.full_name}</p>
                    <p className="truncate text-xs text-muted">{r.user}</p>
                  </td>
                  {dates.map((d) => {
                    const day = r.days[d] ?? { assigned: 0, done: 0 }
                    return (
                      <td key={d} className={clsx('px-1 py-1 text-center', isWeekend(d) && 'opacity-60')}>
                        <span
                          title={`${dayLabel(d)} — ${day.assigned}m ditugaskan, ${day.done}m selesai`}
                          className="inline-flex h-8 w-full min-w-11 flex-col items-center justify-center rounded-md bg-canvas text-[11px] font-semibold tabular-nums leading-tight"
                        >
                          <span className="text-ink">{day.assigned || '·'}</span>
                          <span className="text-emerald-600 dark:text-emerald-400">{day.done || '·'}</span>
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-center font-semibold tabular-nums text-ink">{r.assigned_total}</td>
                  <td className="px-2 py-2 text-center font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{r.done_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  )
}
