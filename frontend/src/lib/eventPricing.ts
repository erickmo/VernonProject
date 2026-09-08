/**
 * Single source for turning Vernon Event.pricing into display text. Six call
 * sites across both frontends each used to decide independently what an
 * unrecognized pricing value means — enum-drift audit finding: every one of
 * them defaulted to "Rupiah" and rendered a specific invented amount (`Rp
 * {price}`) for anything that wasn't exactly 'Free' or 'Points'. Fixed once
 * here instead: an unrecognized value returns the raw string, never a
 * fabricated number — money is the one category where a confident wrong
 * answer costs trust, not just a click.
 */
export function eventPriceLabel(
  pricing: string,
  amounts: { points_cost?: number; price?: number } = {},
): string {
  if (pricing === 'Free') return 'Free'
  if (pricing === 'Points') return `${amounts.points_cost ?? 0} pts`
  if (pricing === 'Rupiah') return `Rp ${(amounts.price ?? 0).toLocaleString('id-ID')}`
  return pricing
}
