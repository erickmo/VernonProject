// Presence / "last seen" from Frappe's User.last_active.
//
// ponytail: last_active is a Frappe site-local NAIVE datetime ("YYYY-MM-DD HH:MM:SS").
// We parse it as browser-local. Correct while site tz (Asia/Jakarta) == viewer tz,
// which holds for this single-region deployment. Upgrade path if it ever goes
// multi-timezone: have the server return last_active as epoch millis / UTC ISO.
//
// ponytail: online window defaults to 15 min because the server writes last_active
// at most once per ~10 min (frappe sessions throttle); a shorter window flickers.

export interface Presence {
  online: boolean
  label: string
}

export function presenceOf(
  lastActive: string | null | undefined,
  onlineWindowMin: number,
): Presence {
  if (!lastActive) return { online: false, label: 'Never signed in' }
  const then = new Date(lastActive.replace(' ', 'T')).getTime()
  if (Number.isNaN(then)) return { online: false, label: 'Never signed in' }
  const diffMs = Date.now() - then
  const win = (onlineWindowMin > 0 ? onlineWindowMin : 15) * 60_000
  if (diffMs < win) return { online: true, label: 'Online now' }
  return { online: false, label: `last seen ${agoLabel(diffMs)}` }
}

function agoLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}
