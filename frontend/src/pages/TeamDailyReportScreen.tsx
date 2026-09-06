import { useMemo, useState } from 'react'
import { Users, Info, AlertTriangle, SearchX, X } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { useTeamDailyReport, useTeamDailyReportAccess } from '@/hooks/useData'
import { MAX_RANGE_DAYS, dayLabel, lastDays, rangeBounds, spanDays } from '@/lib/internAllocation'
import type { TeamDailyReportRow } from '@/lib/types'

const RANGES = [
  { value: '7', label: '7 hari' },
  { value: '14', label: '14 hari' },
  { value: '30', label: '30 hari' },
]

const dateField = 'min-w-0 flex-1 rounded-xl border border-paper-edge bg-paper-card px-2.5 py-2 text-sm text-stone-800 focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

const card = 'rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card'

function DetailSheet({ row, dates, onClose }: { row: TeamDailyReportRow | null; dates: string[]; onClose: () => void }) {
  if (!row) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Rincian ${row.full_name}`}
        className="relative max-h-[82vh] overflow-y-auto rounded-t-3xl bg-paper-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl animate-slide-up dark:bg-slate-800"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-stone-800 dark:text-slate-100">{row.full_name}</h2>
            <p className="truncate text-xs text-stone-400 dark:text-slate-500">{row.user}</p>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {dates.map((d) => {
            const day = row.days[d] ?? { assigned: 0, done: 0 }
            return (
              <div key={d} className="flex items-center justify-between rounded-xl bg-paper-line px-3 py-2 text-sm dark:bg-slate-700/60">
                <span className="text-stone-500 dark:text-slate-400">{dayLabel(d)}</span>
                <span className="flex gap-3 font-semibold tabular-nums">
                  <span className="text-stone-700 dark:text-slate-200">{day.assigned}m ditugaskan</span>
                  <span className="text-emerald-700 dark:text-emerald-300">{day.done}m selesai</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function TeamDailyReportScreen() {
  const [[from, to], setRange] = useState<[string, string]>(() => lastDays(14))
  const today = lastDays(1)[1]
  const activePreset = to === today ? String(spanDays(from, to)) : ''
  const bounds = rangeBounds(from, to)
  const { data: access } = useTeamDailyReportAccess()
  const { data, isLoading, isError, error, refetch } = useTeamDailyReport(from, to, undefined, access?.can ?? false)

  const [q, setQ] = useState('')
  const [detail, setDetail] = useState<TeamDailyReportRow | null>(null)

  const rows = data?.rows ?? []
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => `${r.full_name} ${r.user}`.toLowerCase().includes(needle))
  }, [rows, q])
  const errMsg = String((error as Error)?.message ?? '')
  const denied = access ? !access.can : (isError && /permission|not permitted/i.test(errMsg))
  const failed = isError && !denied

  return (
    <DetailScreen title="Team Daily Report">
      {denied ? (
        <EmptyState icon={Users} title="Tidak ada akses" subtitle="Laporan ini untuk tim HR dan pemimpin proyek." />
      ) : (
        <div className="flex flex-col gap-4 pt-4">
          <div className={`${card} flex flex-col gap-3`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-2xl font-bold text-stone-800 dark:text-slate-50">
                  {data?.totals.assigned ?? 0}
                  <span className="ml-1 text-sm font-medium text-stone-400 dark:text-slate-500">menit ditugaskan</span>
                </p>
                <p className="mt-0.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  {data?.totals.done ?? 0} menit selesai
                </p>
              </div>
              <div className="rounded-full bg-paper-line p-2 text-stone-400 dark:bg-slate-700 dark:text-slate-500" title="Ditugaskan = menit alokasi pada hari itu. Selesai = estimasi tugas yang ditandai Done pada hari itu. Dijumlahkan lintas semua proyek.">
                <Info className="h-5 w-5" />
              </div>
            </div>
            <Segmented options={RANGES} value={activePreset} onChange={(v) => setRange(lastDays(Number(v)))} />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                min={bounds.fromMin}
                max={bounds.fromMax}
                onChange={(e) => e.target.value && setRange([e.target.value, to])}
                aria-label="Tanggal mulai"
                className={dateField}
              />
              <span className="shrink-0 text-stone-400 dark:text-slate-500" aria-hidden>→</span>
              <input
                type="date"
                value={to}
                min={bounds.toMin}
                max={bounds.toMax}
                onChange={(e) => e.target.value && setRange([from, e.target.value])}
                aria-label="Tanggal akhir"
                className={dateField}
              />
            </div>
            <p className="text-center text-[11px] text-stone-400 dark:text-slate-500">
              {spanDays(from, to)} hari · maksimal {MAX_RANGE_DAYS} hari
            </p>
          </div>

          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama anggota…"
            aria-label="Cari nama anggota"
            className="w-full rounded-xl border border-paper-edge bg-paper-card px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />

          {isLoading && (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )}

          {failed && (
            <div className={`${card} flex flex-col items-center gap-3 py-8 text-center`}>
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="font-semibold text-stone-800 dark:text-slate-100">Gagal memuat laporan</p>
              <p className="max-w-xs text-sm text-stone-500 dark:text-slate-400">{errMsg || 'Coba lagi sebentar.'}</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white active:scale-95"
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

          {shown.map((r) => (
            <button
              key={r.user}
              type="button"
              onClick={() => setDetail(r)}
              className={`${card} w-full text-left transition active:scale-[0.99]`}
            >
              <p className="truncate font-semibold text-stone-800 dark:text-slate-100">{r.full_name}</p>
              <div className="mt-1 flex items-center gap-4 text-sm">
                <span className="font-semibold tabular-nums text-stone-700 dark:text-slate-200">{r.assigned_total}m <span className="font-normal text-stone-400 dark:text-slate-500">ditugaskan</span></span>
                <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{r.done_total}m <span className="font-normal text-stone-400 dark:text-slate-500">selesai</span></span>
              </div>
              <div className="no-scrollbar mt-3 flex gap-1 overflow-x-auto pb-1">
                {(data?.dates ?? []).map((d) => {
                  const day = r.days[d] ?? { assigned: 0, done: 0 }
                  return (
                    <span
                      key={d}
                      title={`${dayLabel(d)} — ${day.assigned}m ditugaskan, ${day.done}m selesai`}
                      className="flex h-9 min-w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-paper-line px-1 text-[10px] font-semibold leading-tight tabular-nums dark:bg-slate-700/60"
                    >
                      <span className="text-stone-600 dark:text-slate-300">{day.assigned || '·'}</span>
                      <span className="text-emerald-600 dark:text-emerald-300">{day.done || '·'}</span>
                    </span>
                  )
                })}
              </div>
            </button>
          ))}
        </div>
      )}

      <DetailSheet row={detail} dates={data?.dates ?? []} onClose={() => setDetail(null)} />
    </DetailScreen>
  )
}
