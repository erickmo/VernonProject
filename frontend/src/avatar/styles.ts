import { createAvatar } from '@dicebear/core'
import { lorelei, adventurer, notionists } from '@dicebear/collection'

export const STYLES = { lorelei, adventurer, notionists } as const
export type StyleKey = keyof typeof STYLES
export const STYLE_LIST: StyleKey[] = ['lorelei', 'adventurer', 'notionists']

// Curated, user-meaningful slots; only those a style actually has are shown.
export const CURATED_SLOTS = ['hair','eyes','eyebrows','brows','mouth','lips','glasses','earrings','nose','features','hairAccessories','gesture','beard','head','freckles','body','bodyIcon']
// Slots that are optional (need a probability flag to show/hide).
export const PROB_SLOTS = ['glasses','earrings','features','hairAccessories','gesture','beard']
export const COLOR_SLOTS = ['skinColor','hairColor','backgroundColor']
export const COLOR_PALETTE = ['f2d3b1','ecad80','9e5622','763900','ffd5dc','b6e3f4','c0aede','d1d4f9','ffdfbf','transparent']

export const SKIN_PALETTE = ['f2d3b1','ecad80','d08b5b','9e5622','ae5d29','763900','ffdbac','614335']
export const HAIR_PALETTE = ['0e0e0e','3a2417','6a4e35','b9a05f','e5d7a3','ac6511','cb6820','ab2a18','85c2c6','dba3be','562306','796a45']
export const BG_PALETTE = ['transparent','b6e3f4','c0aede','d1d4f9','ffd5dc','ffdfbf','c1e1c1','f0e6ef']
export function paletteForColorSlot(slot: string): string[] {
  if (slot === 'skinColor') return SKIN_PALETTE
  if (slot === 'hairColor') return HAIR_PALETTE
  return BG_PALETTE
}

export function renderAvatarSvg(style: StyleKey, options: Record<string, string[]>): string {
  const col = STYLES[style] || STYLES.lorelei
  return createAvatar(col as any, options as any).toString()
}

export function slotsForStyle(style: StyleKey): { slot: string; values: string[] }[] {
  const col: any = STYLES[style] || STYLES.lorelei
  const props = col.schema?.properties || {}
  const out: { slot: string; values: string[] }[] = []
  for (const slot of CURATED_SLOTS) {
    const enumVals = props[slot]?.items?.enum
    if (Array.isArray(enumVals) && enumVals.length) out.push({ slot, values: enumVals })
  }
  return out
}

export const PREMIUM_FREE_COUNT = 3
export function variantLabel(index: number): string {
  return `Style ${index + 1}`
}

export function colorSlotsForStyle(style: StyleKey): string[] {
  const col: any = STYLES[style] || STYLES.lorelei
  const props = col.schema?.properties || {}
  const out: string[] = []
  if (props['skinColor']) out.push('skinColor')
  if (props['hairColor']) out.push('hairColor')
  out.push('backgroundColor') // core option, always available
  return out
}
