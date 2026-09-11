export function initials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Thousand-separated integer (e.g. 1000000 -> "1,000,000"). Drops fractions.
export function formatNumber(num: number): string {
  return (num || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

/**
 * Reward Redemption's "else it's Fulfilled" badge was a claim about a thing a
 * person is owed — enum-drift audit finding: anything that wasn't exactly
 * 'Pending' rendered as "Fulfilled", including a status the doctype doesn't
 * even have today. Shows the raw value instead of assuming delivery for
 * anything that isn't the one status this actually confirms.
 */
export function rewardRedemptionStatusLabel(status: string): string {
  return status === 'Fulfilled' ? 'Fulfilled' : status
}

// Marketplace promo pricing. A promo is active only when discounted_points sits
// strictly between 0 and point_cost (0/empty = no promo). Mirrors the server's
// _effective_points in api/mobile.py — keep the two in sync.
export function hasPromo(r: { point_cost: number; discounted_points?: number | null }): boolean {
  const d = r.discounted_points || 0
  return d > 0 && d < r.point_cost
}

export function effectivePoints(r: { point_cost: number; discounted_points?: number | null }): number {
  return hasPromo(r) ? (r.discounted_points as number) : r.point_cost
}

// Net reward for a project detail. Mirrors server calc (project_detail.py):
// Point rewards carry no discount; Rupiah net = bonus - discount.
export function rewardNet(rewardType: string | null, bonus: number | null, discount: number | null): number {
  const b = bonus || 0
  return rewardType === 'Point' ? b : b - (discount || 0)
}

// "500 pts" for Point rewards, "Rp 400,000" for Rupiah.
export function formatReward(rewardType: string | null, amount: number): string {
  return rewardType === 'Point' ? `${formatNumber(amount)} pts` : `Rp ${formatNumber(amount)}`
}

export function formatEstimate(minutes: number): string {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

// "2h 30m / 8h" — done/total estimate. 0 done renders "0m" (formatEstimate alone gives "—").
export function formatEstimateRatio(done: number, total: number): string {
  return `${done ? formatEstimate(done) : '0m'} / ${formatEstimate(total)}`
}

// Minutes-based progress %, falling back to todo count when nothing is estimated.
export function progressPct(
  minutesDone: number,
  minutesTotal: number,
  countDone: number,
  countTotal: number,
): number {
  if (minutesTotal > 0) return Math.round((minutesDone / minutesTotal) * 100)
  return countTotal > 0 ? Math.round((countDone / countTotal) * 100) : 0
}

// Format a millisecond duration as a clock countdown. Always shows MM:SS, and
// prepends H: once an hour or more remains (e.g. "1:05:09"). Negative input is
// treated as its magnitude — the caller adds any "over" sign/label.
export function formatClock(ms: number): string {
  const totalSec = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// Like formatDate but keeps the time: "5 Aug 2026, 14:30". For datetime fields
// (e.g. cancelled_on) where the clock matters, not just the day.
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') || iso.length > 10 ? iso.replace(' ', 'T') : iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Group already date-sorted rows into contiguous sections by their start date (YYYY-MM-DD).
// Order is preserved, so upstream sort (date DESC, time ASC) carries into the groups.
export function groupByStartDate<T extends { start: string }>(rows: T[]): { date: string; items: T[] }[] {
  const out: { date: string; items: T[] }[] = []
  for (const r of rows) {
    const date = r.start.slice(0, 10)
    const last = out[out.length - 1]
    if (last && last.date === date) last.items.push(r)
    else out.push({ date, items: [r] })
  }
  return out
}

// Sub-line for a tile whose value is a relative label ("Today", "in 3 days") — spells out the
// date the label hides, optionally behind a flag like "Overdue".
export function dateSub(iso: string | null | undefined, flag?: string | false | null): string | undefined {
  if (!iso) return undefined
  return [flag || null, formatDate(iso)].filter(Boolean).join(' · ')
}

// Local calendar date as YYYY-MM-DD — matches Frappe Date fields + <input type="date">.
export function toISODate(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function todayISO(): string {
  return toISODate(new Date())
}

// YYYY-MM-DD shifted by n days, TZ-safe (parse as local midnight, add days, format
// back like todayISO). Handles month/year rollover; n may be negative.
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

// Follow-up check dialog remembers the last deadline you picked and prefills it on the
// next open. Reuse a stored date only if it's still today-or-later; a stale past date
// falls back to tomorrow. ISO YYYY-MM-DD sorts lexicographically = chronologically.
export function pickRememberedDeadline(stored: string | null, today: string, tomorrow: string): string {
  return stored && stored >= today ? stored : tomorrow
}

export function stripHtml(html: string): string {
  if (!html) return ''
  // Inert document, as in sanitizeHtml: a live-page div runs <img onerror> and
  // fetches remote src at parse time even though it is never shown.
  return (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').trim()
}

// Unwrap a Frappe error into plain readable text. The thrown message is often a
// JSON-stringified `_server_messages` array of JSON strings, each with HTML.
export function parseFrappeError(raw: string | undefined | null): string {
  if (!raw) return 'Something went wrong'
  let text = raw
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) {
      text = arr
        .map((m) => {
          try {
            return (JSON.parse(m) as { message?: string })?.message ?? String(m)
          } catch {
            return String(m)
          }
        })
        .join(' ')
    }
  } catch {
    /* not JSON — use raw */
  }
  return stripHtml(text) || 'Something went wrong'
}

// Friendly message for a failed delete. Frappe's LinkExistsError reads
// "Cannot delete or cancel because <Doctype> X is linked with <Doctype> Y".
export function deleteErrorMessage(e: unknown, entity: string): string {
  const msg = parseFrappeError((e as { message?: string })?.message)
  if (/linked with/i.test(msg)) {
    const linked = msg.split(/linked with/i)[1]?.replace(/\.$/, '').trim()
    return linked
      ? `Can't delete this ${entity} — still linked with ${linked}. Remove those first.`
      : `Can't delete this ${entity} — it's still in use.`
  }
  return msg
}

// Sanitize untrusted rich-text (e.g. Frappe comment HTML) for safe rendering:
// drop dangerous elements, strip event-handler attributes and javascript: URLs.
// Links open in the same webview (no target=_blank) so they stay inside the
// installed PWA instead of kicking out to an external browser. Keeps formatting.
// True when an <img src> is a safe inline comment image: an app-served file
// (/files/...) or any same-origin URL. Cross-origin/remote and data: URLs are
// dropped to avoid tracking pixels and external content in user HTML.
function isAllowedImgSrc(src: string): boolean {
  const s = (src || '').trim()
  if (s.startsWith('/files/')) return true
  try {
    const u = new URL(s, window.location.origin)
    return u.origin === window.location.origin && u.pathname.startsWith('/files/')
  } catch {
    return false
  }
}

// True when inline CSS would make the browser fetch something: url(), image-set()
// (which also takes bare-string URLs) and CSS Values 4 src(). CSS escapes are
// decoded first ("\75 rl(" IS url( to the CSS tokenizer) and comments dropped,
// so neither smuggles the function name past the check. Over-matching costs one
// element its inline styling; under-matching loads a tracking pixel — the 52 live
// comments with pasted WhatsApp emoji sprites did exactly that on every render.
export function styleFetchesRemote(css: string): boolean {
  const decoded = (css || '')
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex: string) => {
      const n = parseInt(hex, 16)
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd'
    })
    .replace(/\\(.)/g, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  return /(?:url|image-set|src)\s*\(/i.test(decoded)
}

// Attributes that load a remote resource on their own (none survive the <img>
// /files/ rule's intent otherwise): responsive-image sources, the legacy table
// background, a video poster, and the click-tracking ping.
const REMOTE_LOAD_ATTRS = new Set(['srcset', 'background', 'poster', 'ping'])

export function sanitizeHtml(html: string): string {
  if (!html) return ''
  // Parse into an INERT document (no browsing context): an <img>/<video> parsed via
  // innerHTML on a div of the live page starts fetching its src at parse time —
  // before this function can remove it — so a "blocked" remote pixel still fired.
  const root = new DOMParser().parseFromString(html, 'text/html').body
  // Media elements go with the other active content: comments and notes only
  // ever embed images, and <video>/<audio>/<source> with a remote src would
  // fetch it just like a pixel.
  root
    .querySelectorAll('script,style,iframe,object,embed,form,link,meta,base,video,audio,source,track,picture')
    .forEach((n) => n.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || REMOTE_LOAD_ATTRS.has(name)) el.removeAttribute(attr.name)
      else if ((name === 'href' || name === 'src') && /^\s*(javascript|data):/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      } else if (name === 'style' && styleFetchesRemote(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
    // Inline comment images: keep only safe /files/ (or same-origin) sources;
    // unwrap any other <img> entirely so remote/data: pixels never render.
    if (el.tagName === 'IMG') {
      if (!isAllowedImgSrc(el.getAttribute('src') || '')) {
        el.remove()
        return
      }
    }
    // Mention chips: keep <span data-mention="email"> but strip every other
    // attribute so only the marker + text survive.
    if (el.tagName === 'SPAN' && el.hasAttribute('data-mention')) {
      const mention = el.getAttribute('data-mention') || ''
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.toLowerCase() !== 'data-mention') el.removeAttribute(attr.name)
      }
      el.setAttribute('data-mention', mention)
    }
    // Strip any author-supplied target so links don't force a new tab/window.
    if (el.tagName === 'A') {
      el.removeAttribute('target')
      if (el.getAttribute('href')) el.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return root.innerHTML
}

// A deterministic pastel color from a string (for avatars).
export function colorFor(seed: string): string {
  const palette = [
    'bg-rose-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-sky-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-fuchsia-500',
  ]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

/** Sort by ISO date string ascending (soonest first); nulls last. */
export function byDeadlineAsc(
  a: { deadline: string | null },
  b: { deadline: string | null },
): number {
  if (!a.deadline && !b.deadline) return 0
  if (!a.deadline) return 1
  if (!b.deadline) return -1
  return a.deadline.localeCompare(b.deadline)
}

/** Sort by estimated minutes ascending (quickest first); deadline as tiebreak. */
export function byEstimatedAsc(
  a: { estimated: number; deadline: string | null },
  b: { estimated: number; deadline: string | null },
): number {
  const d = (a.estimated || 0) - (b.estimated || 0)
  return d !== 0 ? d : byDeadlineAsc(a, b)
}

/** Sort by ISO date string descending (latest first); nulls last. */
export function byDeadlineDesc(
  a: { deadline: string | null },
  b: { deadline: string | null },
): number {
  if (!a.deadline && !b.deadline) return 0
  if (!a.deadline) return 1
  if (!b.deadline) return -1
  return b.deadline.localeCompare(a.deadline)
}

/** Sort by ISO datetime string descending (latest modified first); nulls last. */
export function byModifiedDesc(
  a: { modified: string | null },
  b: { modified: string | null },
): number {
  if (!a.modified && !b.modified) return 0
  if (!a.modified) return 1
  if (!b.modified) return -1
  return b.modified.localeCompare(a.modified)
}

/** Sort by today's allocated minutes ascending (fewest first); estimate as tiebreak. */
export function byAllocationAsc(
  a: { today_allocation: number; estimated: number; deadline: string | null },
  b: { today_allocation: number; estimated: number; deadline: string | null },
): number {
  const d = (a.today_allocation || 0) - (b.today_allocation || 0)
  return d !== 0 ? d : byEstimatedAsc(a, b)
}

/** A free-text field that holds a link → an href; anything else → null.
 * Used by the Makan Bareng place field (people paste Maps / GoFood links). */
export function externalUrl(text: string | null | undefined): string | null {
  const s = (text ?? '').trim()
  if (/^https?:\/\/\S+$/i.test(s)) return s
  if (/^www\.\S+\.\S+$/i.test(s)) return 'https://' + s
  return null
}

/** Attendance "first seen – last seen" as "08:03–17:05", or "08:03" when seen once.
 * Takes the server's "YYYY-MM-DD HH:MM:SS" strings (no client clock involved). */
export function seenRange(first: string | null | undefined, last: string | null | undefined): string {
  if (!first) return ''
  const a = first.slice(11, 16)
  const b = last ? last.slice(11, 16) : a
  return b === a ? a : `${a}–${b}`
}
