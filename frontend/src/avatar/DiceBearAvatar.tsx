import { useMemo } from 'react'
import { renderAvatarSvg, type StyleKey } from './styles'
import type { AvatarConfig } from '../lib/types'

export function DiceBearAvatar({ config, seed, className }: { config: AvatarConfig; seed?: string; className?: string }) {
  const svg = useMemo(() => {
    try { return renderAvatarSvg(config.style as StyleKey, config.options || {}, seed) }
    catch { return '' }
  }, [config, seed])
  // SVG is library-generated (not user HTML) — safe to inline.
  // [&>svg] utils force the inlined svg to fill the box (deterministic for capture).
  return <div className={`${className || ''} [&>svg]:block [&>svg]:h-full [&>svg]:w-full`} aria-label="avatar" dangerouslySetInnerHTML={{ __html: svg }} />
}
