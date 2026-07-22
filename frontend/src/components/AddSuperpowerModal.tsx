import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Sparkles } from 'lucide-react'
import { SPIcon } from '@/lib/spIcon'

export interface AddSuperpowerItem {
  name: string
  label: string
  icon?: string | null
  color?: string | null
  description?: string | null
}

// Catalog picker shown when adding a self-claimed superpower — each option shows
// its icon, name and Bahasa description so users understand what they're claiming.
// Stays open after a pick so several can be added; the picked one leaves the list
// (parent drops it from `items`). Shared by /m and /w — neutral tokens only.
export function AddSuperpowerModal({
  open,
  onClose,
  items,
  onAdd,
  busy,
}: {
  open: boolean
  onClose: () => void
  items: AddSuperpowerItem[]
  onAdd: (name: string) => void
  busy?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  // Portal to <body> so `fixed`/`absolute` are viewport-relative — an ancestor
  // transform (e.g. Page's animate-rise) would otherwise cap the drawer height.
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-2xl animate-slide-in-right dark:bg-slate-900 sm:w-1/2">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Pilih superpower</h2>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-slate-400 dark:text-slate-500">
              <Sparkles className="h-6 w-6" />
              <p className="text-sm">Semua superpower sudah kamu pilih</p>
            </div>
          ) : (
            items.map((it) => (
              <button
                key={it.name}
                onClick={() => onAdd(it.name)}
                disabled={busy}
                className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 p-3 text-left transition hover:border-brand-400 hover:bg-brand-50/50 active:scale-[0.99] disabled:opacity-50 dark:border-slate-700 dark:hover:border-brand-500 dark:hover:bg-slate-800"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${it.color || '#6366f1'}22` }}
                >
                  <SPIcon icon={it.icon || undefined} color={it.color || undefined} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{it.label}</div>
                  {it.description && (
                    <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">{it.description}</p>
                  )}
                </div>
                <Plus className="mt-1 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
