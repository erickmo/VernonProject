import { useMemo } from 'react'
import { renderAvatarSvg, type StyleKey } from './styles'
import type { AvatarConfig } from '../lib/types'

export function DiceBearAvatar({ config, className }: { config: AvatarConfig; className?: string }) {
  const svg = useMemo(() => {
    try { return renderAvatarSvg(config.style as StyleKey, config.options || {}) }
    catch { return '' }
  }, [config])
  // SVG is library-generated (not user HTML) — safe to inline.
  return <div className={className} aria-label="avatar" dangerouslySetInnerHTML={{ __html: svg }} />
}
