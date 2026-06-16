import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import clsx from 'clsx'

type ToastType = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  type: ToastType
  message: string
}

const ToastCtx = createContext<(type: ToastType, message: string) => void>(() => {})

export const useToast = () => useContext(ToastCtx)

const ICON = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
}
const ACCENT = {
  success: 'text-emerald-600',
  error: 'text-rose-600',
  info: 'text-brand-600',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const push = useCallback((type: ToastType, message: string) => {
    const id = ++seq.current
    setItems((prev) => [...prev, { id, type, message }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3800)
  }, [])

  const dismiss = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        {items.map((t) => {
          const Icon = ICON[t.type]
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-lg"
            >
              <Icon className={clsx('mt-0.5 h-5 w-5 shrink-0', ACCENT[t.type])} />
              <p className="flex-1 text-sm leading-snug text-slate-700">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-slate-300 hover:text-slate-500">
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}
