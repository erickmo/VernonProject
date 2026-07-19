import { useState } from 'react'
import { X, FolderInput, AlertTriangle } from 'lucide-react'
import { useMoveDestinations, useMoveProjectDetail } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'

interface Props {
  open: boolean
  onClose: () => void
  detail: { name: string; title?: string; project?: string }
}

export function MoveProjectDetailSheet({ open, onClose, detail }: Props) {
  const toast = useToast()
  // Mounted only while `open` (parent renders it conditionally), so this only fetches then.
  const dests = useMoveDestinations(detail.name)
  const move = useMoveProjectDetail()

  const [destination, setDestination] = useState('')
  const [blocked, setBlocked] = useState<{ user: string; to_do: string; todo: string }[] | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const options = (dests.data ?? []).map((d) => ({ value: d.name, label: d.project_name }))

  const submit = async () => {
    if (!destination) return
    setSubmitting(true)
    setBlocked(null)
    try {
      const res = await move.mutateAsync({ project_detail: detail.name, destination_project: destination })
      if (res.ok) {
        toast('success', res.moved_todos != null ? `Dipindahkan (${res.moved_todos} tugas)` : 'Detail dipindahkan')
        onClose()
      } else if (res.blocked) {
        setBlocked(res.blocked)
      }
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Pindahkan ke Proyek Lain</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {detail.title && <span className="font-medium text-slate-700 dark:text-slate-200">“{detail.title}” </span>}
          akan dipindahkan beserta semua tugasnya. Setiap penanggung jawab tugas harus menjadi anggota tim proyek tujuan.
        </p>

        <div className="flex flex-col gap-3">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Proyek tujuan
            {dests.isLoading ? (
              <Spinner className="mx-auto my-4 h-5 w-5 text-slate-400 dark:text-slate-500" />
            ) : (
              <SearchableSelect
                value={destination}
                onChange={(v) => { setDestination(v); setBlocked(null) }}
                options={options}
                placeholder={options.length ? 'Pilih proyek…' : 'Tidak ada proyek tujuan'}
              />
            )}
          </div>

          {blocked && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" /> Tidak bisa dipindahkan
              </p>
              <p className="mt-1 text-xs text-amber-700/90 dark:text-amber-300/90">
                Orang berikut belum menjadi anggota tim proyek tujuan. Tambahkan mereka ke tim proyek itu, atau pilih proyek lain.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {blocked.map((b, i) => (
                  <li key={i} className="text-xs text-amber-800 dark:text-amber-200">
                    <span className="font-medium">{b.user}</span> — {b.to_do}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={submit} disabled={!destination || submitting}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {submitting ? <Spinner className="h-4 w-4" /> : <FolderInput className="h-4 w-4" />}
            Pindahkan
          </button>
        </div>
      </div>
    </div>
  )
}
