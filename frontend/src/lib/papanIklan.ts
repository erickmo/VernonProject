// Shared label for a Papan Iklan ad_type — presentation-free, both frontends
// import this. Was independently redefined 3 times (both frontends' list
// screens plus the web detail page) before this consolidation: a maintenance
// trap, not a live bug, but the same shape that has drifted into a real one
// elsewhere on this bench tonight. Colors stay per-frontend/per-screen —
// mobile and web deliberately use different palettes (Soft-Pop vs bento tile),
// see certificate.ts for the same split (shared label/tone-key, local color).
import type { AdType } from './types'

export const TYPE_LABEL: Record<AdType, string> = { Sell: 'Jual', Buy: 'Beli', Rent: 'Sewa' }

/** Web's tint was identical (copy-pasted) between the list and detail pages —
 * genuinely the same choice made twice, not a deliberate per-screen one, so
 * this one IS safe to share unlike mobile's separate palette. */
export const TYPE_TINT_WEB: Record<AdType, string> = {
  Sell: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200',
  Buy: 'bg-sky-100 text-sky-700 dark:bg-sky-500/25 dark:text-sky-200',
  Rent: 'bg-violet-100 text-violet-700 dark:bg-violet-500/25 dark:text-violet-200',
}
