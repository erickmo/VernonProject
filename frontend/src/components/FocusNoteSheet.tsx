import { useEffect, useState } from 'react'
import { X, Check, StickyNote } from 'lucide-react'
import { useFocusTimer } from '@/hooks/useFocusTimer'

interface Props {
  open: boolean
  onClose: () => void
  todoId: string
  title: string
}

// Set the permanent per-task focus note straight from the todo — same store the
// Focus overlay writes to (useFocusTimer.setNote -> Focus Timer.note), so it
// shows on the card without opening a focus session.
export function FocusNoteSheet({ open, onClose, todoId, title }: Props) {
  const focus = useFocusTimer(todoId)
  const [draft, setDraft] = useState('')
  useEffect(() => {
    if (open) setDraft(focus.note)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const save = () => {
    focus.setNote(draft.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-50">
            <StickyNote className="h-5 w-5 text-brand-600" /> Focus note
          </h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 truncate text-sm text-slate-500 dark:text-slate-400">{title}</p>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Jot a note for this task — it stays after you stop and shows on the card."
          className="w-full resize-y rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
        />

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-700 py-3 text-sm font-semibold text-slate-600 dark:text-slate-200 active:scale-95">
            Cancel
          </button>
          <button
            onClick={save}
            className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95"
          >
            <Check className="h-4 w-4" /> Save
          </button>
        </div>
      </div>
    </div>
  )
}
