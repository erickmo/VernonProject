// Build an "Add to Google Calendar" prefilled template URL from a Vernon meeting.
// Pure, dependency-free. Returns null when the meeting has no start time.
// ponytail: hardcoded Asia/Jakarta tz — single-tenant Indonesia site. If the site ever
// changes timezone, read `time_zone` from boot instead.

const CTZ = 'Asia/Jakarta'
const DEFAULT_MINUTES = 30

export type GoogleCalMeeting = {
  title: string
  scheduled_at: string | null
  estimated?: number | null
  notes?: string | null
  participants?: string[] | null
}

type Parts = { y: number; mo: number; d: number; h: number; mi: number }

// "2026-07-22 09:00:00" or "2026-07-22T09:00:00" → parts (null if unparseable)
function parseWallClock(s: string): Parts | null {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return null
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] }
}

// parts → "YYYYMMDDTHHMMSS"
function fmt(p: Parts): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.y}${pad(p.mo)}${pad(p.d)}T${pad(p.h)}${pad(p.mi)}00`
}

export function googleCalUrl(m: GoogleCalMeeting): string | null {
  if (!m.scheduled_at) return null
  const start = parseWallClock(m.scheduled_at)
  if (!start) return null

  const minutes = m.estimated && m.estimated > 0 ? m.estimated : DEFAULT_MINUTES
  // tz-neutral wall-clock arithmetic: add the duration in UTC so the viewer's browser
  // timezone / DST can never shift the delta. We only read the wall-clock components back.
  const e = new Date(Date.UTC(start.y, start.mo - 1, start.d, start.h, start.mi) + minutes * 60000)
  const end: Parts = {
    y: e.getUTCFullYear(), mo: e.getUTCMonth() + 1, d: e.getUTCDate(),
    h: e.getUTCHours(), mi: e.getUTCMinutes(),
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: m.title || '',
    dates: `${fmt(start)}/${fmt(end)}`,
    ctz: CTZ,
  })
  if (m.notes && m.notes.trim()) params.set('details', m.notes)
  const guests = (m.participants || []).filter(Boolean)
  if (guests.length) params.set('add', guests.join(','))

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
