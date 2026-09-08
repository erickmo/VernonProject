import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { mobileApi } from '@/lib/api'
import { STATUS_LABEL } from '@/lib/teguran'
import type { TeguranRow, TeguranStatus } from '@/lib/types'

export const STATUS_TONE: Record<TeguranStatus, string> = {
  Diterbitkan: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Diakui: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Dibatalkan: 'bg-stone-100 text-stone-500 dark:bg-slate-700 dark:text-slate-400',
}

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

/** Inline acknowledge form — only rendered for the employee's own still-Diterbitkan row.
 * The employee's chance to respond before anything escalates, so it stays on the card
 * itself rather than behind a second screen. */
function AcknowledgeForm({ teguran, onDone }: { teguran: TeguranRow; onDone: () => void }) {
  const [tanggapan, setTanggapan] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      await mobileApi.akuiTeguran(teguran.name, tanggapan.trim() || undefined)
      toast('success', 'Teguran diakui')
      onDone()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 border-t border-paper-edge pt-3 dark:border-slate-700">
      <label className="mb-1 block text-xs font-semibold text-slate-500">Tanggapan (opsional)</label>
      <textarea
        className={field + ' min-h-[64px] resize-y'}
        value={tanggapan}
        onChange={(e) => setTanggapan(e.target.value)}
        placeholder="Tanggapan Anda atas Teguran ini…"
      />
      <button
        onClick={submit}
        disabled={busy}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
      >
        {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Akui Teguran ini
      </button>
    </div>
  )
}

export function TeguranCard({
  t,
  mine,
  karyawanLabel,
  ownerLabel,
  onAcknowledged,
}: {
  t: TeguranRow
  /** Whether the current viewer IS the karyawan — gates the acknowledge form. */
  mine: boolean
  /** Admin view only: display name for karyawan (who this Teguran is about). */
  karyawanLabel?: string
  /** Display name for diberikan_oleh; falls back to the raw email when unknown. */
  ownerLabel?: string
  onAcknowledged?: () => void
}) {
  return (
    <div className="rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800">
      {!mine && (
        <p className="mb-1 text-sm font-bold text-stone-800 dark:text-slate-100">{karyawanLabel || t.karyawan}</p>
      )}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-paper-line px-2.5 py-0.5 text-xs font-semibold text-stone-600 dark:bg-slate-700 dark:text-slate-300">
          {t.kategori_pelanggaran}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[t.status]}`}>
          {STATUS_LABEL[t.status]}
        </span>
        {!!t.sp_eligible && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
            <AlertTriangle className="h-3 w-3" /> Layak SP
          </span>
        )}
        <span className="ml-auto text-xs text-stone-400">{t.tanggal}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-stone-700 dark:text-slate-200">{t.deskripsi}</p>
      <p className="mt-1.5 text-xs text-stone-400">Diberikan oleh {ownerLabel || t.diberikan_oleh}</p>

      {t.status === 'Diakui' && t.tanggapan_karyawan && (
        <div className="mt-2 rounded-xl bg-emerald-50/60 p-2.5 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
          <span className="font-semibold">Tanggapan: </span>{t.tanggapan_karyawan}
        </div>
      )}
      {t.status === 'Dibatalkan' && t.alasan_pembatalan && (
        <div className="mt-2 rounded-xl bg-stone-100 p-2.5 text-xs text-stone-500 dark:bg-slate-700/60 dark:text-slate-400">
          <span className="font-semibold">Alasan pembatalan: </span>{t.alasan_pembatalan}
        </div>
      )}

      {mine && t.status === 'Diterbitkan' && onAcknowledged && (
        <AcknowledgeForm teguran={t} onDone={onAcknowledged} />
      )}
    </div>
  )
}

export default function TeguranScreen() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['teguranSaya'],
    queryFn: () => mobileApi.getTeguranSaya(),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['teguranSaya'] })

  return (
    <DetailScreen title="Teguran Saya">
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Belum ada Teguran" subtitle="Catatan peringatan Anda akan muncul di sini." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {data.map((t) => (
            <TeguranCard key={t.name} t={t} mine onAcknowledged={refresh} />
          ))}
        </div>
      )}
    </DetailScreen>
  )
}
