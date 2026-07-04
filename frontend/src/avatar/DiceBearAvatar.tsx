import { useMemo, useState, useEffect } from 'react'
import { renderAvatarSvg } from './styles'
import { isCharacterStyle, characterImagePath } from './characters'
import type { AvatarConfig } from '../lib/types'

export function DiceBearAvatar({ config, seed, className }: { config: AvatarConfig; seed?: string; className?: string }) {
  const isChar = isCharacterStyle(config.style)
  const svg = useMemo(() => {
    if (isChar) return ''
    try { return renderAvatarSvg(config.style, config.options || {}, seed) }
    catch { return '' }
  }, [config, seed, isChar])
  if (isChar) return <CharacterFace style={config.style} className={className} />
  // SVG is library-generated (not user HTML) — safe to inline.
  // [&>svg] utils force the inlined svg to fill the box (deterministic for capture).
  return <div className={`${className || ''} [&>svg]:block [&>svg]:h-full [&>svg]:w-full`} aria-label="avatar" dangerouslySetInnerHTML={{ __html: svg }} />
}

// Character face: use a real drop-in PNG if present, else the stylized SVG.
function CharacterFace({ style, className }: { style: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [style]) // retry the image when the character/form changes
  if (failed) {
    return (
      <div
        className={`${className || ''} [&>svg]:block [&>svg]:h-full [&>svg]:w-full`}
        aria-label="avatar"
        dangerouslySetInnerHTML={{ __html: renderAvatarSvg(style, {}) }}
      />
    )
  }
  return (
    <img
      src={characterImagePath(style)}
      alt="avatar"
      onError={() => setFailed(true)}
      className={`${className || ''} h-full w-full object-contain`}
    />
  )
}
