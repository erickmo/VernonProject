import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { X, ChevronLeft } from 'lucide-react'
import { useModalA11y } from '@web/lib/useModalA11y'

// One overlay primitive for the whole app. Narrow screens get a mobile bottom
// sheet (grabber, slide-up, safe-area pad); sm+ gets a centered modal-card
// (pop-in). Replaces the ad-hoc Dialog/Drawer split. Esc + scrim close.
export function Sheet({
  open, title, onClose, onBack, size = 'md', children,
}: {
  open: boolean
  title?: string
  onClose: () => void
  onBack?: () => void
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}) {
  const ref = useModalA11y(open, onClose)
  if (!open) return null
  const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 animate-fade-in" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          'relative w-full max-h-[85vh] overflow-y-auto bg-surface shadow-2xl',
          'rounded-t-3xl sm:rounded-3xl',
          'p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:pb-5',
          'max-w-[560px]', width,
          'animate-slide-up sm:animate-pop',
        )}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" />
        {(title || onBack) && (
          <div className="mb-4 flex items-center gap-2">
            {onBack && (
              <button onClick={onBack} aria-label="Back" className="rounded-full p-1 text-muted active:scale-90">
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h2 className="flex-1 font-display text-lg font-semibold text-ink">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-hover/[0.04] active:scale-90">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
