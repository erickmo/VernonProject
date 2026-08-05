import { FolderInput, Check, Search } from 'lucide-react'
import type { ProjectItem } from '@/lib/types'
import { useMoveTodosController } from '@/hooks/useMoveTodosController'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Drawer } from '@web/components/overlays/Drawer'
import { Button } from '@web/components/ui'

interface Props {
  open: boolean
  onClose: () => void
  seed: ProjectItem | null
}

// /w Drawer mirror of MoveTodosSheet — move todos to another detail of the same
// project. Shared logic (queries, selection, submit) lives in useMoveTodosController.
export function MoveTodosDialog({ open, onClose, seed }: Props) {
  const c = useMoveTodosController(seed, open, onClose)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Pindahkan Tugas"
      widthClass="max-w-lg"
      onSubmit={c.submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" type="submit" disabled={!c.canSubmit}>
            {c.isPending ? <Spinner className="h-4 w-4" /> : <FolderInput className="h-4 w-4" />}
            Pindahkan{c.checked.size > 0 ? ` (${c.checked.size})` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Pindahkan ke detail lain di proyek
          {seed ? (
            <>
              {' '}
              <span className="font-medium text-ink">{seed.project_name}</span>
            </>
          ) : null}
          .
        </p>

        <label className="text-sm font-medium text-muted">
          Detail tujuan<span className="text-red-500"> *</span>
          <div className="mt-1">
            <SearchableSelect
              value={c.destination}
              onChange={c.setDestination}
              options={c.destinationOptions}
              placeholder={c.hasDestinations ? 'Pilih detail tujuan…' : 'Tidak ada detail lain'}
            />
          </div>
        </label>

        <div className="text-sm font-medium text-muted">
          <div className="flex items-center justify-between">
            <span>Tugas yang dipindah</span>
            <span className="text-xs font-semibold text-brand-600">{c.checked.size} dipilih</span>
          </div>

          {/* Search filter */}
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={c.query}
              onChange={(e) => c.setQuery(e.target.value)}
              placeholder="Cari tugas…"
              className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none"
            />
          </div>

          {/* Select-all shown */}
          {!c.loading && c.filteredTodos.length > 0 && (
            <button
              type="button"
              onClick={c.toggleAllShown}
              className="mt-2 flex items-center gap-2 text-xs font-semibold text-brand-600 hover:opacity-80"
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${c.allShownChecked ? 'border-brand-600 bg-brand-600 text-white' : 'border-line'}`}>
                {c.allShownChecked && <Check className="h-3 w-3" />}
              </span>
              {c.allShownChecked ? 'Batalkan semua' : 'Pilih semua'} ({c.filteredTodos.length})
            </button>
          )}

          <div className="mt-2 max-h-80 min-h-[9rem] overflow-y-auto rounded-xl border border-line">
            {c.loading ? (
              <div className="flex justify-center py-4">
                <Spinner className="h-5 w-5" />
              </div>
            ) : c.filteredTodos.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted">Tidak ada tugas cocok</p>
            ) : (
              c.filteredTodos.map((t) => {
                const on = c.checked.has(t.name)
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => c.toggle(t.name)}
                    className={`flex w-full items-center gap-2.5 border-b border-line px-3 py-2.5 text-left last:border-0 ${on ? 'bg-brand-600/[0.06]' : 'hover:bg-hover/[0.04]'}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line'}`}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate text-sm text-ink">{t.to_do}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
    </Drawer>
  )
}
