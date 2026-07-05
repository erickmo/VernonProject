import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useRejectStatus } from '@/hooks/useData'
import { Spinner } from './ui'

// Opens a dialog to reject a Project Todo under review. A reason is required;
// on submit the todo bounces back to Planned and the assignee is notified.
// Shared by both /m and /w (styling uses neutral tokens, not paper-*/web-only).
type RejectFn = (todoId: string, title?: string) => void

const RejectCtx = createContext<RejectFn>(() => {})
export const useReject = () => useContext(RejectCtx)

interface State {
  todoId: string
  title: string
}

export function RejectProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const reject = useRejectStatus()

  const open = useCallback<RejectFn>((todoId, title = '') => {
    setError(null)
    setReason('')
    setState({ todoId, title })
  }, [])

  const close = useCallback(() => {
    if (reject.isPending) return // never close mid-mutation
    setState(null)
    setError(null)
    setReason('')
  }, [reject.isPending])

  const confirm = useCallback(async () => {
    if (!state || reject.isPending) return
    if (!reason.trim()) {
      setError('Please give a reason.')
      return
    }
    setError(null)
    try {
      await reject.mutateAsync({ todoId: state.todoId, reason: reason.trim() })
      setState(null)
      setReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject')
    }
  }, [state, reason, reject])

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
    <RejectCtx.Provider value={open}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={close} />
          <div className="relative w-full max-w-sm animate-slide-up rounded-3xl bg-white dark:bg-slate-800 p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Reject task?</h2>
            {state.title && (
              <p className="mt-2 text-sm leading-snug text-slate-500 dark:text-slate-400">{state.title}</p>
            )}
            <p className="mt-2 text-sm leading-snug text-slate-500 dark:text-slate-400">
              It goes back to the assignee. No points are earned.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Why is this rejected?"
              className="mt-3 w-full resize-none rounded-2xl border border-slate-200 dark:border-slate-600 bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-rose-400"
            />
            {error && (
              <p className="mt-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={close}
                disabled={reject.isPending}
                className="flex-1 rounded-2xl bg-slate-100 dark:bg-slate-700 py-3 font-semibold text-slate-600 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-600 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={reject.isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-rose-600 py-3 font-semibold text-white shadow-sm active:bg-rose-700 disabled:opacity-60"
              >
                {reject.isPending ? (
                  <Spinner className="h-5 w-5" />
                ) : (
                  <>
                    Reject
                    <X className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </RejectCtx.Provider>
  )
}
