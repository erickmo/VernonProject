import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'

export function HoverCard({
  content, children, className,
}: { content: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const ref = useRef<HTMLSpanElement>(null)
  const enterT = useRef<number>()
  const leaveT = useRef<number>()

  useEffect(() => () => { window.clearTimeout(enterT.current); window.clearTimeout(leaveT.current) }, [])

  const show = () => {
    window.clearTimeout(leaveT.current)
    enterT.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 320) })
      setOpen(true)
    }, 120)
  }
  const hide = () => {
    window.clearTimeout(enterT.current)
    leaveT.current = window.setTimeout(() => setOpen(false), 200)
  }

  return (
    <span ref={ref} className={clsx('inline-flex', className)} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {open && (
        <div
          onMouseEnter={show}
          onMouseLeave={hide}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-72 rounded-lg border border-line bg-surface p-3 text-sm shadow-pop animate-fade-in"
        >
          {content}
        </div>
      )}
    </span>
  )
}
