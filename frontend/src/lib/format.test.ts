import { describe, it, expect } from 'vitest'
import { rewardRedemptionStatusLabel } from './format'

describe('rewardRedemptionStatusLabel', () => {
  it('labels Fulfilled correctly', () => {
    expect(rewardRedemptionStatusLabel('Fulfilled')).toBe('Fulfilled')
  })

  it('never claims delivery for a status that is not actually Fulfilled', () => {
    // The exact drift this guards: the old inline `r.status === 'Pending' ?
    // <button> : 'Fulfilled'` treated any non-Pending status as delivered.
    expect(rewardRedemptionStatusLabel('Cancelled')).toBe('Cancelled')
    expect(rewardRedemptionStatusLabel('Cancelled')).not.toBe('Fulfilled')
  })
})
