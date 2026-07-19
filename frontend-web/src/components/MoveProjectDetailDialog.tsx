import { useState } from 'react'
import { AlertTriangle, FolderInput } from 'lucide-react'
import { useMoveDestinations, useMoveProjectDetail } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Drawer } from '@web/components/overlays/Drawer'
import { Button } from '@web/components/ui'

interface Props {
  open: boolean
  onClose: () => void
  detail: { name: string; title?: string; project?: string }
}

type Blocked = { user: string; to_do: string; todo: string }[]

export function MoveProjectDetailDialog({ open, onClose, detail }: Props) {
  const toast = useToast()
  const move = useMoveProjectDetail()
  // Only fetches while open — the hook is gated on a truthy project_detail.
  const dests = useMoveDestinations(open ? detail.name : '')
  const [destination, setDestination] = useState('')
  const [blocked, setBlocked] = useState<Blocked | null>(null)

  const close = () => {
    setDestination('')
    setBlocked(null)
    onClose()
  }

  const submit = async () => {
    if (!destination) return
    setBlocked(null)
    try {
      const res = await move.mutateAsync({ project_detail: detail.name, destination_project: destination })
      if (res.ok) {
        toast(
          'success',
          res.moved_todos
            ? `Detail dipindahkan (${res.moved_todos} todo ikut pindah)`
            : 'Detail berhasil dipindahkan',
        )
        close()
      } else if (res.blocked) {
        setBlocked(res.blocked)
      }
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const options = (dests.data ?? []).map((d) => ({ value: d.name, label: d.project_name }))

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Pindahkan ke Proyek Lain"
      widthClass="max-w-lg"
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Batal
          </Button>
          <Button variant="primary" type="submit" disabled={!destination || move.isPending}>
            {move.isPending ? <Spinner className="h-4 w-4" /> : <FolderInput className="h-4 w-4" />}
            Pindahkan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {detail.title ? <>Memindahkan <span className="font-medium text-ink">{detail.title}</span>. </> : null}
          Setiap penerima tugas di detail ini harus menjadi anggota proyek tujuan.
        </p>

        <label className="text-sm font-medium text-muted">
          Proyek tujuan<span className="text-red-500"> *</span>
          <div className="mt-1">
            {dests.isLoading ? (
              <div className="flex justify-center py-4">
                <Spinner className="h-5 w-5" />
              </div>
            ) : (
              <SearchableSelect
                value={destination}
                onChange={setDestination}
                options={options}
                placeholder="Pilih proyek tujuan…"
              />
            )}
          </div>
        </label>

        {blocked && blocked.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/15">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Tidak bisa dipindahkan
            </div>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-200/80">
              Penerima tugas berikut bukan anggota proyek tujuan. Tambahkan mereka ke proyek tujuan lebih dulu.
            </p>
            <ul className="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-200">
              {blocked.map((b, i) => (
                <li key={i}>
                  <span className="font-medium">{b.user}</span> — {b.to_do}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Drawer>
  )
}
