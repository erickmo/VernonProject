import { useEffect, useState } from 'react'
import { Dialog } from '@web/components/overlays/Dialog'
import { Button } from '@web/components/ui'
import { useFocusTimer } from '@/hooks/useFocusTimer'

// Set the permanent per-task focus note straight from the todo — same store the
// Focus overlay writes to (useFocusTimer.setNote -> Focus Timer.note), so it
// shows on the card without opening a focus session.
export function FocusNoteDialog({
  open,
  onClose,
  todoId,
  title,
}: {
  open: boolean
  onClose: () => void
  todoId: string
  title: string
}) {
  const focus = useFocusTimer(todoId)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (open) setDraft(focus.note)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const save = () => {
    focus.setNote(draft.trim())
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Focus note · ${title}`}
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Save
          </Button>
        </>
      }
    >
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        autoFocus
        placeholder="Jot a note for this task — it stays after you stop and shows on the card."
        className="w-full resize-y rounded-xl border border-line dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:text-slate-100"
      />
    </Dialog>
  )
}
