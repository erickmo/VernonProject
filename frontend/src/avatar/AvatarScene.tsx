import type { CSSProperties } from 'react'
import { DiceBearAvatar } from './DiceBearAvatar'
import type { AvatarConfig, AvatarAsset } from '../lib/types'

function anchorStyle(anchor?: string | null): CSSProperties {
  if (anchor === 'top') return { top: '-4%', left: '50%', transform: 'translateX(-50%)', fontSize: '2.4rem', lineHeight: 1 }
  if (anchor === 'corner') return { top: '4%', right: '4%', fontSize: '1.6rem', lineHeight: 1 }
  return { bottom: '4%', left: '4%', fontSize: '1.6rem', lineHeight: 1 }
}

export function AvatarScene({ config, assets, className }: { config: AvatarConfig; assets: AvatarAsset[]; className?: string }) {
  const by = (n?: string | null) => (n ? assets.find((a) => a.asset_name === n) : undefined)
  const scene = by(config.scene)
  // When a scene is set, render the face transparent so the scene shows behind it.
  const faceConfig: AvatarConfig = scene
    ? { ...config, options: { ...config.options, backgroundColor: [], backgroundType: [] } }
    : config
  const props = (config.props || []).map(by).filter(Boolean) as AvatarAsset[]
  return (
    <div className={`relative overflow-hidden ${className || ''}`} style={scene?.gradient ? { background: scene.gradient } : undefined}>
      <DiceBearAvatar config={faceConfig} className="h-full w-full" />
      {props.map((p, i) => (
        <span key={i} className="pointer-events-none absolute select-none" style={anchorStyle(p.anchor)}>{p.emoji}</span>
      ))}
    </div>
  )
}
