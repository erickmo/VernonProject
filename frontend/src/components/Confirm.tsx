import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useModalEscape } from '@/hooks/useModalEscape'

interface ConfirmInput {
  placeholder?: string
  initial?: string
  rows?: number
}

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  // When set, the dialog shows a textarea. confirm() then resolves to the entered
  // string on confirm (or null on cancel/dismiss) instead of a boolean.
  input?: ConfirmInput
}

// Overloaded: input dialogs resolve to the text (or null), plain ones to a boolean.
type ConfirmFn = {
  (opts: ConfirmOptions & { input: ConfirmInput }): Promise<string | null>
  (opts: ConfirmOptions): Promise<boolean>
}

const ConfirmCtx = createContext<ConfirmFn>((async () => false) as ConfirmFn)

export const useConfirm = () => useContext(ConfirmCtx)

interface PendingConfirm extends ConfirmOptions {
  resolve: (v: boolean | string | null) => void
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [text, setText] = useState('')
  const pendingRef = useRef<PendingConfirm | null>(null)
  const textRef = useRef('')
  pendingRef.current = pending
  textRef.current = text

  const confirm = useCallback(((opts: ConfirmOptions) => {
    return new Promise<boolean | string | null>((resolve) => {
      setText(opts.input?.initial ?? '')
      setPending({ ...opts, resolve })
    })
  }) as ConfirmFn, [])

  const close = useCallback((ok: boolean) => {
    setPending((cur) => {
      if (cur) cur.resolve(cur.input ? (ok ? textRef.current : null) : ok)
      return null
    })
  }, [])

  // Escape closes (cancel) via the shared modal stack so a confirm opened inside
  // the todo drawer doesn't also close the drawer.
  useModalEscape(!!pending, () => close(false))

  useEffect(() => {
    if (!pending) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Enter confirms plain dialogs; in a textarea it must insert a newline.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !pending.input) close(true)
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
            {pending.input && (
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={pending.input.rows ?? 2}
                placeholder={pending.input.placeholder}
                className="mt-3 w-full resize-none rounded-xl border border-slate-200 dark:border-slate-600 bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-400 dark:focus:border-slate-400"
              />
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
