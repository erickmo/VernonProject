import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Undo2 } from 'lucide-react'
import { useUndoApproval } from '@/hooks/useData'
import { Spinner } from './ui'

// Opens a dialog to undo the CURRENT user's own most recent approval (Leader's
// Done->Checked or Owner's Checked->Completed) on a Project Todo. No reason
// needed — this is self-service and only offered while it's still valid (see
// can_undo, computed server-side). Shared by both /m and /w.
type UndoFn = (todoId: string, title?: string) => void

const UndoCtx = createContext<UndoFn>(() => {})
export const useUndo = () => useContext(UndoCtx)

interface State {
  todoId: string
  title: string
}

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const undo = useUndoApproval()

  const open = useCallback<UndoFn>((todoId, title = '') => {
    setError(null)
    setState({ todoId, title })
  }, [])

  const close = useCallback(() => {
    if (undo.isPending) return // never close mid-mutation
    setState(null)
    setError(null)
  }, [undo.isPending])

  const confirm = useCallback(async () => {
    if (!state || undo.isPending) return
    setError(null)
    try {
      await undo.mutateAsync(state.todoId)
      setState(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to undo')
    }
  }, [state, undo])

  useEffect(() => {
    if (!state) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [state, close])

  return (
    <UndoCtx.Provider value={open}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={close} />
          <div className="relative w-full max-w-sm animate-slide-up rounded-3xl bg-white dark:bg-slate-800 p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Undo your approval?</h2>
            {state.title && (
              <p className="mt-2 text-sm leading-snug text-slate-500 dark:text-slate-400">{state.title}</p>
            )}
            <p className="mt-2 text-sm leading-snug text-slate-500 dark:text-slate-400">
              It goes back one step. Any points minted from it are removed.
            </p>
            {error && (
              <p className="mt-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={close}
                disabled={undo.isPending}
                className="flex-1 rounded-2xl bg-slate-100 dark:bg-slate-700 py-3 font-semibold text-slate-600 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-600 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={undo.isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-amber-600 py-3 font-semibold text-white shadow-sm active:bg-amber-700 disabled:opacity-60"
              >
                {undo.isPending ? (
                  <Spinner className="h-5 w-5" />
                ) : (
                  <>
                    Undo
                    <Undo2 className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </UndoCtx.Provider>
  )
}
