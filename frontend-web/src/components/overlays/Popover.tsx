import { useEffect, useRef, type ReactNode, type RefObject } from 'react'

export function Popover({
  open, onClose, anchorRef, children, align = 'right',
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement>
  children: ReactNode
  align?: 'left' | 'right'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, onClose, anchorRef])

  if (!open) return null
  return (
    <div
      ref={panelRef}
      className={`absolute top-full mt-2 ${align === 'right' ? 'right-0' : 'left-0'} z-40 w-72 max-h-[70vh] overflow-y-auto rounded-xl bg-surface shadow-xl border border-line p-4`}
    >
      {children}
    </div>
  )
}
