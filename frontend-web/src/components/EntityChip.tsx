import type { ReactNode, ComponentType } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Avatar } from '@/components/ui'
import type { AvatarConfig } from '@/lib/types'
import { HoverCard } from '@web/components/HoverCard'

export function EntityChip({
  to, icon: Icon, image, config, avatarName, label, preview, className,
}: {
  to?: string
  icon?: ComponentType<{ className?: string }>
  image?: string            // person avatar image url (PNG snapshot fallback)
  config?: AvatarConfig | null  // live DiceBear config; Avatar prefers it over image
  avatarName?: string       // person name → triggers Avatar render
  label: ReactNode
  preview?: ReactNode       // HoverCard content
  className?: string
}) {
  const inner = (
    <span className={clsx(
      'inline-flex max-w-full items-center gap-1.5 rounded-full bg-hover/[0.05] px-2.5 py-0.5 text-sm text-ink',
      to && 'hover:bg-hover/[0.1]',
      className,
    )}>
      {avatarName != null
        ? <Avatar name={avatarName} image={image} config={config} size={18} />
        : Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />}
      <span className="truncate">{label}</span>
    </span>
  )
  const node = to ? <Link to={to}>{inner}</Link> : inner
  return preview ? <HoverCard content={preview}>{node}</HoverCard> : node
}
