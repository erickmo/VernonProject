import { describe, it, expect } from 'vitest'
import { eventPriceLabel } from './eventPricing'

describe('eventPriceLabel', () => {
  it('labels Free with no amount', () => {
    expect(eventPriceLabel('Free')).toBe('Free')
  })

  it('labels Points using points_cost', () => {
    expect(eventPriceLabel('Points', { points_cost: 250 })).toBe('250 pts')
    expect(eventPriceLabel('Points')).toBe('0 pts')
  })

  it('labels Rupiah using price, formatted id-ID', () => {
    expect(eventPriceLabel('Rupiah', { price: 50000 })).toBe('Rp 50.000')
  })

  it('never invents an amount for an unrecognized pricing value — shows the raw value instead', () => {
    // The exact drift this guards: before the fix, anything that wasn't
    // 'Free'/'Points' fell into an implicit "else = Rupiah" branch and
    // rendered a specific invented price. A 4th real pricing kind added to
    // the doctype tomorrow must not silently become a fake Rupiah amount.
    expect(eventPriceLabel('Subscription', { price: 50000 })).toBe('Subscription')
    expect(eventPriceLabel('Subscription', { price: 50000 })).not.toContain('Rp')
  })
})
