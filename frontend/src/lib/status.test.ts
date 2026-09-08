import { describe, it, expect } from 'vitest'
import { STATUS } from './status'

// Enum-drift audit finding #3: STATUS must not throw on a status_key it
// doesn't recognize — verified by reading + a node -e check when this was
// fixed; this pins that behavior for real.
describe('STATUS fallback', () => {
  it('resolves every known status normally', () => {
    expect(STATUS.planned.label).toBe('Planned')
    expect(STATUS.done.label).toBe('Done')
    expect(STATUS.checked.label).toBe('Leader approved')
    expect(STATUS.completed.label).toBe('Owner approved')
    expect(STATUS.cancelled.label).toBe('Cancelled')
  })

  it('returns a neutral fallback for an unrecognized key via bracket access', () => {
    const meta = STATUS['some_future_status_v6']
    expect(meta).toBeDefined()
    expect(meta.label).toBe('Unknown')
  })

  it('does not throw when a caller accesses .label directly with no optional chain', () => {
    // Most of the ~12 real call sites do this — STATUS[key].label, no `?.`.
    expect(() => STATUS['bogus'].label).not.toThrow()
  })

  it('still works with optional chaining, matching the one call site that used it', () => {
    expect(STATUS['bogus']?.label).toBe('Unknown')
  })
})
