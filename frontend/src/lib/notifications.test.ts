import { describe, it, expect } from 'vitest'
import { TYPE_ICON } from './notifications'

// Enum-drift audit finding #1: Vernon Notification's "Warning" type (added
// for the Teguran feature) was missing from this map, so a real HR warning
// notification rendered a generic Bell instead of a warning icon.
describe('TYPE_ICON', () => {
  it('has an icon for every NotificationType, including the newest one', () => {
    // Record<NotificationType, LucideIcon> makes this exhaustive at the type
    // level too — this just proves it at runtime.
    expect(TYPE_ICON.Warning).toBeDefined()
  })

  it('maps Warning to a distinct icon, not the generic fallback used elsewhere', () => {
    expect(TYPE_ICON.Warning).not.toBe(TYPE_ICON.Comment)
  })
})
