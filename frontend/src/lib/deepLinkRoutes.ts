import type { DeepLinkRoutes } from './notifications'

/**
 * Where notification deep links land on MOBILE (/m). Web has its own copy at
 * frontend-web/src/lib/deepLinkRoutes.ts — the paths genuinely differ per app
 * (mobile '/teguran' vs web '/attendance/teguran'), which is why DeepLinkRoutes
 * is a parameter of deepLink rather than baked into it.
 *
 * ONE definition per app, on purpose. This map used to be copy-pasted into both
 * NotificationsScreen and Today; when `teguran` was added only the first copy got
 * it, so every Teguran notification opened from the Today screen deep-linked to
 * `undefined`. The `: DeepLinkRoutes` annotation is the guard — add a key to the
 * interface and this file stops compiling until it is filled in here.
 */
export const DEEP_LINK_ROUTES: DeepLinkRoutes = {
  exceptionApprovals: '/attendance/approvals',
  myExceptions: '/attendance/my-requests',
  hrExceptions: '/attendance/manage/exceptions',
  teguran: '/teguran',
}
