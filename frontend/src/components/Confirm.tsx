import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmCtx = createContext<ConfirmFn>(async () => false)

export const useConfirm = () => useContext(ConfirmCtx)

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const pendingRef = useRef<PendingConfirm | null>(null)
  pendingRef.current = pending

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve })
    })
  }, [])

  const close = useCallback((ok: boolean) => {
    setPending((cur) => {
      cur?.resolve(ok)
      return null
    })
  }, [])

  useEffect(() => {
    if (!pending) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') close(true)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [pending, close])

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-slate-900/40 animate-fade-in"
            onClick={() => close(false)}
          />
          <div className="relative w-full max-w-sm animate-slide-up rounded-3xl bg-white dark:bg-slate-800 p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{pending.title}</h2>
            {pending.message && (
              <p className="mt-2 text-sm leading-snug text-slate-500 dark:text-slate-400">{pending.message}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => close(false)}
                className="flex-1 rounded-2xl bg-slate-100 dark:bg-slate-700 py-3 font-semibold text-slate-600 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-600"
              >
                {pending.cancelLabel || 'Cancel'}
              </button>
              <button
                onClick={() => close(true)}
                className={clsx(
                  'flex-1 rounded-2xl py-3 font-semibold text-white shadow-sm',
                  pending.destructive
                    ? 'bg-rose-600 active:bg-rose-700'
                    : 'bg-brand-600 active:bg-brand-700',
                )}
              >
                {pending.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  )
}
