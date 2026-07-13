import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'

export function CardList({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
}

export function Card({
  onClick, stripe, eyebrow, title, meta, right, footer,
}: {
  onClick?: () => void
  stripe?: string          // e.g. 'border-rose-400'; omit for a plain card
  eyebrow?: React.ReactNode
  title: React.ReactNode
  meta?: React.ReactNode   // pill/badge row
  right?: React.ReactNode  // defaults to a chevron when onClick is set
  footer?: React.ReactNode
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'group w-full rounded-2xl bg-surface p-4 text-left shadow-card transition',
        onClick && 'active:scale-[0.99] hover:-translate-y-px hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        stripe ? `border-l-4 ${stripe}` : '',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="mb-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted">{eyebrow}</p>}
          <div className="font-semibold leading-snug text-ink">{title}</div>
          {meta && <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">{meta}</div>}
        </div>
        {right ?? (onClick ? <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-line" /> : null)}
      </div>
      {footer && <div className="mt-3 flex gap-2 border-t border-line pt-3">{footer}</div>}
    </Tag>
  )
}
