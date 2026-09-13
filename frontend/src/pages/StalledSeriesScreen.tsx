import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useStalledSeries, useReassignSeries } from '@/hooks/useData'
import type { StalledSeriesRow } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

function Row({ row }: { row: StalledSeriesRow }) {
  const toast = useToast()
  const reassign = useReassignSeries()
  // Prefilled with the server's leader-then-owner suggestion, but the lead can
  // pick anyone on the team — the routine is usually better off with whoever
  // actually does that work, not with the lead by default.
  const [to, setTo] = useState(row.suggested || '')
  const busy = reassign.isPending

  const submit = async () => {
    if (!to) return
    try {
      await reassign.mutateAsync({ series: row.series, toUser: to })
      toast('success', 'Rutinitas dilanjutkan')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{row.to_do}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {row.frequency}
            {row.last_deadline ? ` · terakhir ${row.last_deadline}` : ''}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          Berhenti
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {row.assigned_to_name} — {row.reason_label}
      </p>

      {row.paused ? (
        // A paused series is stalled for a second, deliberate reason. Reassigning
        // would not restart it, so say so instead of offering a button that no-ops.
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Rutinitas ini juga sedang dijeda. Lanjutkan jeda dulu sebelum dialihkan.
        </p>
      ) : row.candidates.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Belum ada anggota aktif di tim proyek ini. Tambahkan anggota dulu.
        </p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <select className={field} value={to} onChange={(e) => setTo(e.target.value)} disabled={busy}>
            <option value="">Pilih penerima…</option>
            {row.candidates.map((c) => (
              <option key={c.user} value={c.user}>
                {c.full_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !to}
            className="shrink-0 rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? '…' : 'Alihkan'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function StalledSeriesScreen() {
  const { data: rows, isLoading } = useStalledSeries()

  return (
    <DetailScreen title="Rutinitas berhenti">
      {isLoading ? (
        <Spinner />
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={RotateCcw} title="Tidak ada rutinitas yang berhenti" />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Rutinitas ini berhenti dibuat karena orang yang mengerjakannya sudah
            tidak aktif atau tidak lagi di tim proyek. Alihkan ke orang lain untuk
            melanjutkannya.
          </p>
          {rows.map((r) => (
            <Row key={r.series} row={r} />
          ))}
          <p className="flex items-center gap-1.5 pt-1 text-xs text-slate-400">
            <RotateCcw size={12} />
            Tugas yang sudah selesai tetap tercatat atas nama pengerjanya.
          </p>
        </div>
      )}
    </DetailScreen>
  )
}
