import type { DeepLinkRoutes } from '@/lib/notifications'

/**
 * Where notification deep links land on WEB (/w). Mobile has its own copy at
 * frontend/src/lib/deepLinkRoutes.ts — the paths genuinely differ per app
 * (web '/attendance/teguran' vs mobile '/teguran'), which is why DeepLinkRoutes
 * is a parameter of deepLink rather than baked into it.
 *
 * ONE definition per app, on purpose. This map used to be copy-pasted into both
 * NotificationSheet and Home; when `teguran` was added only the first copy got
 * it, so every Teguran notification opened from the Home screen deep-linked to
 * `undefined`. The `: DeepLinkRoutes` annotation is the guard — add a key to the
 * interface and this file stops compiling until it is filled in here.
 */
export const DEEP_LINK_ROUTES: DeepLinkRoutes = {
  exceptionApprovals: '/attendance/my-approvals',
  myExceptions: '/attendance/my-requests',
  hrExceptions: '/attendance/exceptions',
  teguran: '/attendance/teguran',
}
