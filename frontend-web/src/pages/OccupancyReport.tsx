import { useMemo, useState } from 'react'
import { UserMinus, UserPlus, ShieldAlert, SearchX } from 'lucide-react'
import { Page, PageHeader } from '@web/components/Page'
import { DatePicker } from '@web/components/DatePicker'
import { EmptyState, Spinner } from '@/components/ui'
import { useBoot, useOverOccupied, useUnderOccupied } from '@/hooks/useData'
import { formatEstimate } from '@/lib/format'
import { MAX_RANGE_DAYS, lastDays, rangeBounds, spanDays } from '@/lib/internAllocation'
import type { OccupancyReport as Report } from '@/lib/types'

const FIELD = 'rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none'
const TH = 'whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted'

// The two reports are one shape mirrored around each user's shift target, so one
// page serves both — only the wording and which verdict pair to read differ.
const MODES = {
  under: {
    title: 'Under-Occupied',
    icon: UserMinus,
    hint: 'Tugas harian di bawah target shift, melebihi toleransi.',
    empty: 'Semua anggota cukup terisi.',
    gapLabel: 'Kekurangan',
    daysLabel: 'Hari kurang',
    tone: 'text-amber-600 dark:text-amber-400',
  },
  over: {
    title: 'Over-Occupied',
    icon: UserPlus,
    hint: 'Tugas harian melebihi target shift, melebihi toleransi.',
    empty: 'Tidak ada anggota yang kelebihan beban.',
    gapLabel: 'Kelebihan',
    daysLabel: 'Hari lebih',
    tone: 'text-rose-600 dark:text-rose-400',
  },
} as const

type Mode = keyof typeof MODES

function verdict(mode: Mode, row: Report<'under'>['rows'][number] | Report<'over'>['rows'][number]) {
  return mode === 'under'
    ? { gap: (row as Report<'under'>['rows'][number]).deficit, days: (row as Report<'under'>['rows'][number]).under_days }
    : { gap: (row as Report<'over'>['rows'][number]).surplus, days: (row as Report<'over'>['rows'][number]).over_days }
}

export default function OccupancyReport({ mode }: { mode: Mode }) {
  const [[from, to], setRange] = useState<[string, string]>(() => lastDays(7))
  const bounds = rangeBounds(from, to)
  const { data: boot } = useBoot()
  const isSystemManager = !!boot?.roles.includes('System Manager')
  const cfg = MODES[mode]

  const under = useUnderOccupied(from, to, isSystemManager && mode === 'under')
  const over = useOverOccupied(from, to, isSystemManager && mode === 'over')
  const { data, isLoading } = mode === 'under' ? under : over

  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const rows = data?.rows ?? []
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => `${r.full_name} ${r.user}`.toLowerCase().includes(needle))
  }, [data, q])

  if (boot && !isSystemManager) {
    return (
      <Page>
        <PageHeader icon={cfg.icon} title={cfg.title} />
        <EmptyState icon={ShieldAlert} title="Akses ditolak" subtitle="Laporan ini hanya untuk System Manager." />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        icon={cfg.icon}
        title={cfg.title}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{cfg.hint}</span>
            {data && (
              <>
                <span className="text-line">|</span>
                <span>Toleransi {formatEstimate(data.tolerance)}</span>
                <span className="text-line">|</span>
                <span>{data.day_count} hari</span>
              </>
            )}
          </span>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
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

      {!isLoading && data && shown.length === 0 && (
        <EmptyState
          icon={data.rows.length ? SearchX : cfg.icon}
          title={data.rows.length ? 'Tidak ada anggota' : cfg.empty}
          subtitle={data.rows.length
            ? 'Tidak ada yang cocok dengan pencarian ini.'
            : 'Hari tanpa shift tidak punya target, jadi tidak dinilai.'}
        />
      )}

      {!isLoading && data && shown.length > 0 && (
        // Only this container scrolls sideways — the page body never does.
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={`${TH} text-left`}>Anggota</th>
                <th className={`${TH} text-right`}>Ditugaskan</th>
                <th className={`${TH} text-right`}>Target</th>
                <th className={`${TH} text-right`}>{cfg.gapLabel}</th>
                <th className={`${TH} text-right`}>{cfg.daysLabel}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const v = verdict(mode, r)
                return (
                  <tr key={r.user} className="border-b border-line/60 last:border-0 hover:bg-canvas">
                    <td className="px-3 py-2">
                      <p className="truncate font-medium text-ink">{r.full_name}</p>
                      <p className="truncate text-xs text-muted">{r.user}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{formatEstimate(r.assigned_total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{formatEstimate(r.expected_total)}</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${cfg.tone}`}>{formatEstimate(v.gap)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{v.days}</td>
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
