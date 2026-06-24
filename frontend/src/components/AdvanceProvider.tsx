import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useAdvanceStatus } from '@/hooks/useData'
import { Spinner } from './ui'

// Opens a confirm dialog for a Project Todo status advance. After a successful
// advance, if the SAME user is permitted to advance again, the dialog stays open
// and relabels to the next step so consecutive approvals chain in one session.
// Otherwise the dialog closes. On error it stays open and shows the message.
type AdvanceFn = (todoId: string, label: string, title?: string) => void

const AdvanceCtx = createContext<AdvanceFn>(() => {})
export const useAdvance = () => useContext(AdvanceCtx)

interface State {
  todoId: string
  label: string // current step's action label, e.g. "Approve (Leader)"
  title: string // task title, shown for context
}

export function AdvanceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const advance = useAdvanceStatus()

  const open = useCallback<AdvanceFn>((todoId, label, title = '') => {
    setError(null)
    setState({ todoId, label, title })
  }, [])

  const close = useCallback(() => {
    if (advance.isPending) return // never close mid-mutation
    setState(null)
    setError(null)
  }, [advance.isPending])

  const confirm = useCallback(async () => {
    if (!state || advance.isPending) return
    setError(null)
    try {
      const res = await advance.mutateAsync(state.todoId)
      if (res.can_advance && res.next_status_label) {
        // chain: relabel and keep the dialog open for the next step
        const nextLabel = res.next_status_label
        setState((s) => (s ? { ...s, label: nextLabel } : s))
      } else {
        setState(null) // no further step for this user → close
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to advance')
    }
  }, [state, advance])

  useEffect(() => {
    if (!state) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'Enter') confirm()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [state, close, confirm])

  return (
    <AdvanceCtx.Provider value={open}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={close} />
          <div className="relative w-full max-w-sm animate-slide-up rounded-3xl bg-white dark:bg-slate-800 p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{state.label}?</h2>
            {state.title && (
              <p className="mt-2 text-sm leading-snug text-slate-500 dark:text-slate-400">{state.title}</p>
            )}
            {error && (
              <p className="mt-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                onClick={close}
                disabled={advance.isPending}
                className="flex-1 rounded-2xl bg-slate-100 dark:bg-slate-700 py-3 font-semibold text-slate-600 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-600 disabled:opacity-60"
              >
                {error ? 'Close' : 'Cancel'}
              </button>
              <button
                onClick={confirm}
                disabled={advance.isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand-600 py-3 font-semibold text-white shadow-sm active:bg-brand-700 disabled:opacity-60"
              >
                {advance.isPending ? (
                  <Spinner className="h-5 w-5" />
                ) : (
                  <>
                    {state.label}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdvanceCtx.Provider>
  )
}
