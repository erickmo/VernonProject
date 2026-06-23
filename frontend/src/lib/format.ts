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

export function formatEstimate(minutes: number): string {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
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

export function stripHtml(html: string): string {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return (tmp.textContent || tmp.innerText || '').trim()
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

export function sanitizeHtml(html: string): string {
  if (!html) return ''
  const root = document.createElement('div')
  root.innerHTML = html
  root.querySelectorAll('script,style,iframe,object,embed,form,link,meta,base').forEach((n) => n.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) el.removeAttribute(attr.name)
      else if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
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
