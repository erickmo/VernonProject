import type { CSSProperties } from 'react'
import { DiceBearAvatar } from './DiceBearAvatar'
import { CollectibleIcon } from './collectibleIcons'
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
  const fc = by(config.featured_collectible)
  return (
    <div className={`relative overflow-hidden ${className || ''}`} style={scene?.gradient ? { background: scene.gradient } : undefined}>
      <DiceBearAvatar config={faceConfig} className="h-full w-full" />
      {props.map((p, i) => (
        <span key={i} className="pointer-events-none absolute select-none" style={anchorStyle(p.anchor)}>
          {p.image
            ? <img src={p.image} alt="" className="h-9 w-9 object-contain" />
            : p.icon
              ? <CollectibleIcon name={p.icon} className="h-7 w-7 text-stone-700 dark:text-white" />
              : p.emoji}
        </span>
      ))}
      {fc && (fc.image
        ? <img src={fc.image} alt="" className="pointer-events-none absolute bottom-[4%] right-[4%] h-14 w-14 select-none object-contain" />
        : fc.icon
          ? <CollectibleIcon name={fc.icon} className="pointer-events-none absolute bottom-[4%] right-[4%] h-10 w-10 select-none" />
          : fc.emoji && <span className="pointer-events-none absolute bottom-[4%] right-[4%] select-none text-4xl leading-none">{fc.emoji}</span>
      )}
    </div>
  )
}
