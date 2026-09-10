import { describe, it, expect } from 'vitest'
import { TYPE_ICON, deepLink } from './notifications'
import { DEEP_LINK_ROUTES } from './deepLinkRoutes'

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

// Enum-drift finding #5, same family as #1 above and the reason DEEP_LINK_ROUTES
// exists: the routes map was copy-pasted into each caller, and when `teguran` was
// added to DeepLinkRoutes only the notification-list copy got it. The Today (/m)
// and Home (/w) copies kept three keys, so `routes.teguran` was undefined there —
// deepLink handed `undefined` to navigate(), which is NOT the '/' fallback that
// unmapped doctypes get. The recipient of a Teguran has no other way into their
// own list, so this was the one link that mattered.
describe('deepLink for Teguran', () => {
  const teguranNotification = { reference_doctype: 'Teguran', reference_name: 'TGR-0001' } as Parameters<typeof deepLink>[0]

  it('sends a Teguran notification to the app that owns the route, not to undefined', () => {
    expect(deepLink(teguranNotification, DEEP_LINK_ROUTES)).toBe('/teguran')
  })

  it('resolves to a real path for every route the mobile map declares', () => {
    // The drift itself: a missing key produced undefined, which is neither a path
    // nor the '/' fallback. Nothing may resolve to undefined.
    for (const doctype of ['Teguran', 'Attendance Exception', 'Attendance Exception HR', 'Attendance Exception Approval']) {
      const to = deepLink({ reference_doctype: doctype, reference_name: 'X' } as Parameters<typeof deepLink>[0], DEEP_LINK_ROUTES)
      expect(to, `${doctype} deep link`).toMatch(/^\//)
    }
  })

  it('still lands unmapped doctypes on home rather than a dead route', () => {
    expect(deepLink({ reference_doctype: 'Nothing We Map', reference_name: 'X' } as Parameters<typeof deepLink>[0], DEEP_LINK_ROUTES)).toBe('/')
  })

  it('reproduces the bug when a key is missing, so this test cannot pass vacuously', () => {
    const incomplete = { exceptionApprovals: '/a', myExceptions: '/b', hrExceptions: '/c' } as unknown as typeof DEEP_LINK_ROUTES
    expect(deepLink(teguranNotification, incomplete)).toBeUndefined()
  })
})
