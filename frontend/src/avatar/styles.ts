import { createAvatar } from '@dicebear/core'
import { lorelei, adventurer, notionists } from '@dicebear/collection'

export const STYLES = { lorelei, adventurer, notionists } as const
export type StyleKey = keyof typeof STYLES
export const STYLE_LIST: StyleKey[] = ['lorelei', 'adventurer', 'notionists']

// Curated, user-meaningful slots; only those a style actually has are shown.
export const CURATED_SLOTS = ['hair','eyes','eyebrows','brows','mouth','lips','glasses','earrings','nose','features','hairAccessories','gesture']
// Slots that are optional (need a probability flag to show/hide).
export const PROB_SLOTS = ['glasses','earrings','features','hairAccessories','gesture','beard']
export const COLOR_SLOTS = ['skinColor','hairColor','backgroundColor']
export const COLOR_PALETTE = ['f2d3b1','ecad80','9e5622','763900','ffd5dc','b6e3f4','c0aede','d1d4f9','ffdfbf','transparent']

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

export function colorSlotsForStyle(style: StyleKey): string[] {
  const col: any = STYLES[style] || STYLES.lorelei
  const props = col.schema?.properties || {}
  return COLOR_SLOTS.filter((c) => props[c])
}
