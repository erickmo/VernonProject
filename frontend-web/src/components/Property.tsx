import type { ReactNode, ComponentType } from 'react'

export function PropertyRow({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[8rem,1fr] gap-x-3 gap-y-1.5 text-sm">{children}</dl>
}

export function Property({
  label, icon: Icon, children,
}: {
  label: ReactNode; icon?: ComponentType<{ className?: string }>; children: ReactNode
}) {
  return (
    <>
      <dt className="flex items-center gap-1.5 py-1 text-muted">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="flex min-w-0 items-center py-1 text-ink">{children}</dd>
    </>
  )
}
