import { type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useModalA11y } from '@web/lib/useModalA11y'

export function Drawer({
  open, onClose, title, children, footer, widthClass = 'max-w-md', onSubmit,
  scrim = 'bg-black/50',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  widthClass?: string
  /** When provided, body + footer are wrapped in a <form> (Enter-to-submit). */
  onSubmit?: () => void
  /** Backdrop tint. Lighter (e.g. 'bg-black/20') keeps the list behind readable. */
  scrim?: string
}) {
  const ref = useModalA11y(open, onClose)
  if (!open) return null

  const body = (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && (
        <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2">
          {footer}
        </div>
      )}
    </>
  )

  return (
    <div className="fixed inset-0 z-50">
      <div className={`absolute inset-0 animate-fade-in ${scrim}`} onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`absolute right-0 top-0 h-full w-full ${widthClass} flex flex-col bg-surface shadow-xl`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="text-muted hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        {onSubmit ? (
          <form className="flex-1 flex flex-col min-h-0" onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>
  )
}
