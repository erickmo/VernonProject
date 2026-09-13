import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useStalledSeries, useReassignSeries } from '@/hooks/useData'
import type { StalledSeriesRow } from '@/lib/types'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Card, CardList } from '@web/components/Card'

const field =
  'flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

function Reassign({ row }: { row: StalledSeriesRow }) {
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

  if (row.paused) {
    // Paused is a second, deliberate reason to be stopped; reassigning would not
    // restart it, so say so rather than offer a button that quietly does nothing.
    return <span className="text-xs text-slate-500 dark:text-slate-400">Sedang dijeda — lanjutkan jeda dulu</span>
  }
  if (row.candidates.length === 0) {
    return (
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Belum ada anggota aktif di tim proyek ini
      </span>
    )
  }
  return (
    <div className="flex items-center gap-2">
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
        className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? '…' : 'Alihkan'}
      </button>
    </div>
  )
}

export default function StalledSeries() {
  const { data: rows, isLoading } = useStalledSeries()

  return (
    <BentoGrid>
      <BentoTile title="Rutinitas berhenti" span="full">
        {isLoading ? (
          <Spinner />
        ) : !rows || rows.length === 0 ? (
          <EmptyState icon={RotateCcw} title="Tidak ada rutinitas yang berhenti" />
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
              Rutinitas ini berhenti dibuat karena orang yang mengerjakannya sudah tidak
              aktif atau tidak lagi di tim proyek. Alihkan ke orang lain untuk melanjutkannya.
            </p>
            <CardList>
              {rows.map((r) => (
                <Card
                  key={r.series}
                  stripe="border-amber-400"
                  eyebrow={`${r.frequency ?? ''}${r.last_deadline ? ` · terakhir ${r.last_deadline}` : ''}`}
                  title={r.to_do}
                  meta={`${r.assigned_to_name} — ${r.reason_label}`}
                  footer={<Reassign row={r} />}
                />
              ))}
            </CardList>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
              <RotateCcw size={12} />
              Tugas yang sudah selesai tetap tercatat atas nama pengerjanya.
            </p>
          </>
        )}
      </BentoTile>
    </BentoGrid>
  )
}
