import { describe, it, expect } from 'vitest'
import { canHrApprove } from './useData'
import type { Boot } from '@/lib/types'

// Regression lock for the b0dtp0hihs bug: canHrApprove is the ONE shared gate
// both /m and /w call to decide Teguran (and other HR tools) visibility. The
// real bug wasn't in this function -- it was that bootstrap() (api/mobile.py)
// omitted "HR Manager" from the roles array this function reads, so a pure HR
// Manager's boot.roles could never satisfy it. That server-side fix is proven
// in the backend suite (test_bootstrap_reports_hr_manager_role); this pins
// the function's OWN contract so nobody narrows it back down by accident.
function bootWith(roles: string[]): Boot {
  return { roles } as Boot
}

describe('canHrApprove', () => {
  it('is true for a System Manager', () => {
    expect(canHrApprove(bootWith(['System Manager']))).toBe(true)
  })

  it('is true for a pure HR Manager (no System Manager role)', () => {
    expect(canHrApprove(bootWith(['HR Manager']))).toBe(true)
  })

  it('is false for a role with neither', () => {
    expect(canHrApprove(bootWith(['Project Owner', 'Project Team']))).toBe(false)
  })

  it('is false for an empty roles array', () => {
    expect(canHrApprove(bootWith([]))).toBe(false)
  })

  it('is false when boot itself is undefined (not yet loaded)', () => {
    expect(canHrApprove(undefined)).toBe(false)
  })
})
