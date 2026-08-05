import { X, FolderInput, Check, Search } from 'lucide-react'
import type { ProjectItem } from '@/lib/types'
import { useMoveTodosController } from '@/hooks/useMoveTodosController'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'

interface Props {
  open: boolean
  onClose: () => void
  seed: ProjectItem | null
}

// /m bottom-sheet to move todos to another detail of the same project. Opened from
// the todo context menu, seeded with the long-pressed todo (pre-checked); the user
// can batch more todos from the same source detail before moving.
export function MoveTodosSheet({ open, onClose, seed }: Props) {
  const c = useMoveTodosController(seed, open, onClose)
  if (!open || !seed) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Pindahkan Tugas</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Pindahkan ke detail lain di proyek{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">{seed.project_name}</span>.
        </p>

        <div className="flex flex-col gap-3">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Detail tujuan
            <div className="mt-1">
              <SearchableSelect
                value={c.destination}
                onChange={c.setDestination}
                options={c.destinationOptions}
                placeholder={c.hasDestinations ? 'Pilih detail…' : 'Tidak ada detail lain'}
              />
            </div>
          </div>

          <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
            <div className="flex items-center justify-between">
              <span>Tugas yang dipindah</span>
              <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">{c.checked.size} dipilih</span>
            </div>

            {/* Search filter */}
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={c.query}
                onChange={(e) => c.setQuery(e.target.value)}
                placeholder="Cari tugas…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {/* Select-all shown */}
            {!c.loading && c.filteredTodos.length > 0 && (
              <button
                onClick={c.toggleAllShown}
                className="mt-2 flex items-center gap-2 text-xs font-semibold text-brand-600 active:scale-95 dark:text-brand-400"
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${c.allShownChecked ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                  {c.allShownChecked && <Check className="h-3 w-3" />}
                </span>
                {c.allShownChecked ? 'Batalkan semua' : 'Pilih semua'} ({c.filteredTodos.length})
              </button>
            )}

            <div className="mt-2 max-h-72 min-h-[8rem] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
              {c.loading ? (
                <Spinner className="mx-auto my-4 h-5 w-5 text-slate-400 dark:text-slate-500" />
              ) : c.filteredTodos.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">Tidak ada tugas cocok</p>
              ) : (
                c.filteredTodos.map((t) => {
                  const on = c.checked.has(t.name)
                  return (
                    <button
                      key={t.name}
                      onClick={() => c.toggle(t.name)}
                      className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0 dark:border-slate-700/60 ${on ? 'bg-brand-50/60 dark:bg-brand-500/10' : 'active:bg-slate-50 dark:active:bg-slate-700/40'}`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                        {on && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="truncate text-sm text-slate-700 dark:text-slate-100">{t.to_do}</span>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <button
            onClick={c.submit}
            disabled={!c.canSubmit}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            {c.isPending ? <Spinner className="h-4 w-4" /> : <FolderInput className="h-4 w-4" />}
            Pindahkan{c.checked.size > 0 ? ` (${c.checked.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
