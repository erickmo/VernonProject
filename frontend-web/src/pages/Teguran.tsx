import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Ban, Check } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { mobileApi } from '@/lib/api'
import { STATUS_LABEL } from '@/lib/teguran'
import type { TeguranRow, TeguranStatus } from '@/lib/types'
import { BentoGrid, BentoTile } from '@web/components/bento'

export const STATUS_TONE: Record<TeguranStatus, string> = {
  Diterbitkan: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Diakui: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Dibatalkan: 'bg-line/60 text-muted',
}

const field = 'w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink'

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
    <div className="mt-3 border-t border-line pt-3">
      <label className="mb-1 block text-xs font-semibold text-muted">Tanggapan (opsional)</label>
      <textarea className={field + ' min-h-[64px] resize-y'} value={tanggapan} onChange={(e) => setTanggapan(e.target.value)} placeholder="Tanggapan Anda atas Teguran ini…" />
      <button
        onClick={submit}
        disabled={busy}
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-50"
      >
        {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Akui Teguran ini
      </button>
    </div>
  )
}

export function TeguranTile({
  t,
  mine,
  karyawanLabel,
  ownerLabel,
  onAcknowledged,
  onCancel,
}: {
  t: TeguranRow
  mine: boolean
  karyawanLabel?: string
  ownerLabel?: string
  onAcknowledged?: () => void
  /** Admin view only: renders a "Batalkan Teguran" action inside the tile. */
  onCancel?: () => void
}) {
  return (
    <BentoTile span="full" tone="plain">
      {!mine && <p className="mb-1 font-semibold text-ink">{karyawanLabel || t.karyawan}</p>}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-line/60 px-2.5 py-0.5 text-xs font-semibold text-ink">{t.kategori_pelanggaran}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
        {!!t.sp_eligible && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
            <AlertTriangle className="h-3 w-3" /> Layak SP
          </span>
        )}
        <span className="ml-auto text-xs text-muted">{t.tanggal}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-ink">{t.deskripsi}</p>
      <p className="mt-1.5 text-xs text-muted">Diberikan oleh {ownerLabel || t.diberikan_oleh}</p>

      {t.status === 'Diakui' && t.tanggapan_karyawan && (
        <div className="mt-2 rounded-xl bg-emerald-50/60 p-2.5 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
          <span className="font-semibold">Tanggapan: </span>{t.tanggapan_karyawan}
        </div>
      )}
      {t.status === 'Dibatalkan' && t.alasan_pembatalan && (
        <div className="mt-2 rounded-xl bg-line/40 p-2.5 text-xs text-muted">
          <span className="font-semibold">Alasan pembatalan: </span>{t.alasan_pembatalan}
        </div>
      )}

      {mine && t.status === 'Diterbitkan' && onAcknowledged && <AcknowledgeForm teguran={t} onDone={onAcknowledged} />}

      {onCancel && t.status !== 'Dibatalkan' && (
        <button
          onClick={onCancel}
          className="mt-3 inline-flex items-center gap-1 border-t border-line pt-3 text-xs font-semibold text-rose-600 transition hover:opacity-80 dark:text-rose-400"
        >
          <Ban className="h-3.5 w-3.5" /> Batalkan Teguran
        </button>
      )}
    </BentoTile>
  )
}

export default function Teguran() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['teguranSaya'], queryFn: () => mobileApi.getTeguranSaya() })
  const refresh = () => qc.invalidateQueries({ queryKey: ['teguranSaya'] })

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Teguran Saya</h1>
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !data || data.length === 0 ? (
        <BentoGrid>
          <BentoTile span="full" tone="plain">
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <AlertTriangle className="h-8 w-8 text-muted" />
              <p className="font-semibold text-ink">Belum ada Teguran</p>
              <p className="text-sm text-muted">Catatan peringatan Anda akan muncul di sini.</p>
            </div>
          </BentoTile>
        </BentoGrid>
      ) : (
        <BentoGrid>
          {data.map((t) => (
            <TeguranTile key={t.name} t={t} mine onAcknowledged={refresh} />
          ))}
        </BentoGrid>
      )}
    </div>
  )
}
