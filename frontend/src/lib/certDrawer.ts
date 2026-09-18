// Single source of truth for "is this the certificate form route", shared by both
// frontends' modal-route interceptor (web's side drawer, mobile's slide-up sheet) —
// the same shape as todoDrawer.ts, because this is the same mechanism.
//
// One path segment after /certificates/, so `new` (the create form) opens exactly the
// way an existing certificate does. The list itself is what the overlay sits on top
// of, and anything deeper renders in place rather than in the overlay.
const CERT_PATH = /^\/certificates\/[^/]+$/

export function isCertificatePath(path: string): boolean {
  return CERT_PATH.test(path)
}
