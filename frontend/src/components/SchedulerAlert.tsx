import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useBoot, keys } from '@/hooks/useData'
import { mobileApi } from '@/lib/api'

// be86ciu75f: when no scheduled job has run for an hour, System Managers see this on
// Home (/m Today, /w Home) — the server sends `scheduler` in bootstrap to them only —
// and can switch the scheduler back on in one tap. A scheduler paused in the site
// config, or a stalled scheduler process, can't be fixed from the app: it says so.

const WHY: Record<string, string> = {
  disabled: 'Penjadwal dimatikan di pengaturan sistem.',
  paused: 'Penjadwal dijeda di konfigurasi server — perlu akses server untuk menyalakannya.',
  stalled: 'Penjadwal menyala tapi tidak ada job yang berjalan — server perlu di-restart. Jika baru saja diaktifkan, tunggu beberapa menit.',
}

export function SchedulerAlert({ className = '' }: { className?: string }) {
  const { data: boot } = useBoot()
  const qc = useQueryClient()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | { error: string }>('idle')
  const s = boot?.scheduler
  if (!s || s.ok || state === 'done') {
    return state === 'done' ? (
      <p role="status" className={`rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 ${className}`}>
        Penjadwal diaktifkan. Job terjadwal akan berjalan lagi dalam beberapa menit.
      </p>
    ) : null
  }

  const enable = async () => {
    setState('busy')
    try {
      await mobileApi.enableScheduler()
      setState('done')
      void qc.invalidateQueries({ queryKey: keys.boot })
    } catch (e) {
      setState({ error: (e as Error).message || 'Gagal mengaktifkan penjadwal.' })
    }
  }

  return (
    <div role="alert" className={`rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100 ${className}`}>
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" /> Penjadwal otomatis tidak berjalan
      </p>
      <p className="mt-1">
        Tidak ada job terjadwal sejak {s.last_run_human ?? '—'}: tugas rutin, pengingat dan absensi harian tidak dibuat. {WHY[s.reason ?? 'stalled']}
      </p>
      {s.reason === 'disabled' && (
        <button
          type="button"
          onClick={enable}
          disabled={state === 'busy'}
          className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {state === 'busy' ? 'Mengaktifkan…' : 'Aktifkan penjadwal'}
        </button>
      )}
      {typeof state === 'object' && <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{state.error}</p>}
    </div>
  )
}
