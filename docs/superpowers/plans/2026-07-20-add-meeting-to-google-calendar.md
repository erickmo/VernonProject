# Add Meeting to Google Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-tap "Add to Google Calendar" button to every meeting surface in both frontends, with no backend, no OAuth, and no stored credentials.

**Architecture:** A shared pure function `googleCalUrl(meeting)` (in `frontend/src/lib`, imported by both frontends via `@`) builds a Google Calendar `render?action=TEMPLATE` URL from an existing `MeetingListItem`. A single shared presentational component `GoogleCalButton` renders the link (or nothing) and is dropped into all 5 meeting render sites. No DocType, endpoint, or hook change.

**Tech Stack:** TypeScript, React, Vite, lucide-react. Self-check run via esbuild→node (no test runner installed).

## Global Constraints

- **Both frontends.** `frontend/` = mobile (`/m`), `frontend-web/` = web (`/w`). Shared behaviour lives in `frontend/src` (web imports it as `@`). This feature's shared behaviour (`googleCalUrl`) and the shared button component both live under `frontend/src` and are consumed by both — no per-platform logic duplication.
- **No backend change** → do NOT run `gen_docs.py`, `bench migrate`, or `tj-restart`. Frontend-only.
- **Timezone:** hardcode `ctz=Asia/Jakarta` (single-tenant Indonesia, UTC+7, no DST).
- **Done status string** is exactly `'✅ Done'` (emoji + space + "Done").
- **Commits:** the working tree has parallel WIP from the user. Stage ONLY the files each task names with explicit `git add <path>` — NEVER `git add -A` / `git add .`. Only commit when the user approves (harness rule); if unapproved, leave staged/unstaged and report.
- **No new dependency.** `URLSearchParams`, `Date.UTC`, and `lucide-react` (already present) cover everything.

---

### Task 1: Shared URL builder + self-check

**Files:**
- Create: `frontend/src/lib/googleCal.ts`
- Test: `frontend/src/lib/googleCal.selfcheck.ts`

**Interfaces:**
- Produces: `googleCalUrl(m: GoogleCalMeeting): string | null` and the type `GoogleCalMeeting` (a structural subset of `MeetingListItem`).

- [ ] **Step 1: Write the failing self-check**

Create `frontend/src/lib/googleCal.selfcheck.ts`:

```ts
// @ts-nocheck — test-only, run via esbuild (see focusMerge.selfcheck.ts pattern).
// Run: npx esbuild --bundle src/lib/googleCal.selfcheck.ts --platform=node | node
import assert from 'node:assert'
import { googleCalUrl } from './googleCal'

const base = { title: 'Sprint Sync', scheduled_at: '2026-07-22 09:00:00', estimated: 30, notes: '', participants: [] }

// 1) null when no start time
assert.equal(googleCalUrl({ ...base, scheduled_at: null }), null, 'null scheduled_at → null')
assert.equal(googleCalUrl({ ...base, scheduled_at: '' }), null, 'empty scheduled_at → null')

// 2) basic shape: TEMPLATE action + Asia/Jakarta tz
let u = new URL(googleCalUrl(base))
assert.equal(u.origin + u.pathname, 'https://calendar.google.com/calendar/render', 'render endpoint')
assert.equal(u.searchParams.get('action'), 'TEMPLATE', 'action=TEMPLATE')
assert.equal(u.searchParams.get('ctz'), 'Asia/Jakarta', 'ctz hardcoded')
assert.equal(u.searchParams.get('text'), 'Sprint Sync', 'title → text')

// 3) dates START/END, wall-clock basic format, END = START + estimated
assert.equal(u.searchParams.get('dates'), '20260722T090000/20260722T093000', '30-min end')

// 4) estimated 0/undefined → 30-min default
u = new URL(googleCalUrl({ ...base, estimated: 0 }))
assert.equal(u.searchParams.get('dates'), '20260722T090000/20260722T093000', 'estimated 0 → 30-min default')
u = new URL(googleCalUrl({ ...base, estimated: undefined }))
assert.equal(u.searchParams.get('dates'), '20260722T090000/20260722T093000', 'estimated undefined → 30-min default')

// 5) hour/day rollover via UTC math (23:50 + 30 → next day 00:20)
u = new URL(googleCalUrl({ ...base, scheduled_at: '2026-07-22 23:50:00', estimated: 30 }))
assert.equal(u.searchParams.get('dates'), '20260722T235000/20260723T002000', 'rolls into next day')

// 6) accepts ISO 'T' separator too
u = new URL(googleCalUrl({ ...base, scheduled_at: '2026-07-22T09:00:00' }))
assert.equal(u.searchParams.get('dates'), '20260722T090000/20260722T093000', 'T-separator parsed')

// 7) notes → details, omitted when empty
assert.equal(new URL(googleCalUrl(base)).searchParams.has('details'), false, 'no details when notes empty')
u = new URL(googleCalUrl({ ...base, notes: 'Bring the deck' }))
assert.equal(u.searchParams.get('details'), 'Bring the deck', 'notes → details')

// 8) participants → add (comma-joined), omitted when empty
assert.equal(new URL(googleCalUrl(base)).searchParams.has('add'), false, 'no add when no participants')
u = new URL(googleCalUrl({ ...base, participants: ['a@x.id', 'b@x.id'] }))
assert.equal(u.searchParams.get('add'), 'a@x.id,b@x.id', 'participants → add guests')

console.log('googleCal self-check OK')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx esbuild --bundle src/lib/googleCal.selfcheck.ts --platform=node | node`
Expected: FAIL — esbuild errors resolving `./googleCal` (module not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/googleCal.ts`:

```ts
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
```

- [ ] **Step 4: Run the self-check to verify it passes**

Run: `cd frontend && npx esbuild --bundle src/lib/googleCal.selfcheck.ts --platform=node | node`
Expected: PASS — prints `googleCal self-check OK`.

Note: `URLSearchParams` encodes spaces as `+` and commas as `%2C` in `toString()`; the assertions read via `new URL(...).searchParams.get()` which decodes them, so they compare against the decoded values. Google's render endpoint decodes `+`→space and `%2C`→`,` correctly.

- [ ] **Step 5: Commit** (only if user approved committing)

```bash
git add frontend/src/lib/googleCal.ts frontend/src/lib/googleCal.selfcheck.ts
git commit -m "feat(meetings): googleCalUrl builder + self-check"
```

---

### Task 2: Shared button component + wire into all 5 meeting surfaces + build

**Files:**
- Create: `frontend/src/components/GoogleCalButton.tsx`
- Modify: `frontend-web/src/pages/Meetings.tsx` (card action area, ~line 80–93)
- Modify: `frontend-web/src/components/ProjectMeetings.tsx` (card action area, ~line 117–128)
- Modify: `frontend/src/pages/MeetingsScreen.tsx` (card action area, ~line 70–84)
- Modify: `frontend/src/components/ProjectMeetings.tsx` (card action area, ~line 115–126)
- Modify: `frontend/src/components/MeetingSheet.tsx` (action area, ~line 131–136 — shared detail sheet, both platforms)

**Interfaces:**
- Consumes: `googleCalUrl` from Task 1; `MeetingListItem` from `@/lib/types`.
- Produces: `GoogleCalButton({ meeting, className? })` — returns the link, or `null` when the meeting is Done or has no start time.

- [ ] **Step 1: Create the shared button component**

Create `frontend/src/components/GoogleCalButton.tsx`:

```tsx
import { CalendarPlus } from 'lucide-react'
import { googleCalUrl } from '@/lib/googleCal'
import type { MeetingListItem } from '@/lib/types'

// One shared "Add to Google Calendar" link for every meeting surface (both frontends).
// Renders nothing for a Done meeting (past) or one with no start time.
export function GoogleCalButton({ meeting, className = '' }: { meeting: MeetingListItem; className?: string }) {
  if (meeting.status === '✅ Done') return null
  const url = googleCalUrl(meeting)
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 ${className}`}
    >
      <CalendarPlus className="h-4 w-4" /> Add to Google Calendar
    </a>
  )
}
```

`onClick stopPropagation` prevents the link from also triggering a card's own click handler (the detail-sheet cards are clickable).

- [ ] **Step 2: Wire into web `Meetings.tsx`**

Add the import after the existing component imports (near line 9):

```tsx
import { GoogleCalButton } from '@/components/GoogleCalButton'
```

The card footer currently holds the Mark-done / Reopen buttons in a flex row (around line 80–93). Add the button into that same row, before the existing action, e.g.:

```tsx
<GoogleCalButton meeting={m} />
```

If the action row is a single element (no wrapping flex), wrap both in `<div className="flex items-center gap-3 flex-wrap">…</div>` so they sit side by side. Read the exact JSX around lines 78–95 first and place `<GoogleCalButton meeting={m} />` as the first child of that action row.

- [ ] **Step 3: Wire into web `ProjectMeetings.tsx`**

Add the same import (near line 12). In the card action area (around line 117–128, the `{m.can_mark_done && (...)}` block), place `<GoogleCalButton meeting={m} />` in that action row so it shows regardless of `can_mark_done` (any user can add to their own calendar). Read lines 110–130 first; put it in the flex row that contains Reopen / Mark-done, or if that row only renders under `can_mark_done`, add it just above that block inside the card footer:

```tsx
<GoogleCalButton meeting={m} />
{m.can_mark_done && (
  // …existing Reopen / Mark-done…
)}
```

- [ ] **Step 4: Wire into mobile `MeetingsScreen.tsx`**

Add the import (near line 9):

```tsx
import { GoogleCalButton } from '@/components/GoogleCalButton'
```

In the card action area (around line 70–84, the `{m.can_mark_done && (...)}` block), add it just above so every attendee sees it:

```tsx
<GoogleCalButton meeting={m} />
{m.can_mark_done && (
  // …existing Reopen / Mark-done…
)}
```

Read lines 64–86 first to place it inside the card's footer container.

- [ ] **Step 5: Wire into mobile `ProjectMeetings.tsx`**

Same as Step 3 but in `frontend/src/components/ProjectMeetings.tsx` (import near line 10; action area around line 115–126). Read lines 108–128 first; place `<GoogleCalButton meeting={m} />` above the `{m.can_mark_done && (...)}` block in the card footer.

- [ ] **Step 6: Wire into shared `MeetingSheet.tsx` (detail, both platforms)**

Add the import near the other `@/components` imports (around line 14):

```tsx
import { GoogleCalButton } from '@/components/GoogleCalButton'
```

The detail sheet renders action buttons around line 131–136 (Reopen / Mark-done as `<Action>` items). Add the link into that action area:

```tsx
<GoogleCalButton meeting={m} className="px-1" />
```

Read lines 118–140 first and place it within the actions container (it is a plain `<a>`, so it sits fine alongside the `<Action>` buttons; adjust `className` spacing to match).

- [ ] **Step 7: Typecheck both frontends**

Run: `cd frontend && npx tsc --noEmit`
Then: `cd ../frontend-web && npx tsc --noEmit`
Expected: no new errors referencing `googleCal`, `GoogleCalButton`, `Meetings`, `ProjectMeetings`, or `MeetingSheet`. (Pre-existing unrelated errors, if any, are out of scope — compare against a clean `git stash` baseline only if unsure.)

- [ ] **Step 8: Build both bundles**

Run: `cd frontend && npm run build`
Then: `cd ../frontend-web && npm run build`
Expected: both builds succeed; new hashed assets appear under `vernon_project/public/frontend/assets/` and `vernon_project/public/frontend_web/assets/`.

- [ ] **Step 9: Verify the feature is actually in the built bundle**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && grep -rl "calendar.google.com/calendar/render" vernon_project/public/frontend/assets vernon_project/public/frontend_web/assets`
Expected: at least one hashed JS file in EACH assets dir matches. (Source committed but absent from the built bundle is not shipped.)

- [ ] **Step 10: Commit** (only if user approved committing)

```bash
git add frontend/src/components/GoogleCalButton.tsx \
  frontend-web/src/pages/Meetings.tsx frontend-web/src/components/ProjectMeetings.tsx \
  frontend/src/pages/MeetingsScreen.tsx frontend/src/components/ProjectMeetings.tsx \
  frontend/src/components/MeetingSheet.tsx \
  vernon_project/public/frontend/assets vernon_project/public/frontend_web/assets
git commit -m "feat(meetings): Add to Google Calendar button on every meeting surface (both frontends)"
```

---

### Task 3: What's New (App Release row)

**Files:** none in git — this inserts a live DB row on `project.vernon.id`.

Only do this once Task 2 Step 9 confirms the string is in BOTH built bundles.

- [ ] **Step 1: Find the newest existing App Release version to bump from**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.get_all("App Release", fields=["version","release_date","platform"], order_by="creation desc", limit=3))
EOF
```
Semver-bump from the newest `version` (feature → minor bump).

- [ ] **Step 2: Write the release JSON**

Create `/tmp/claude-1000/gcal-release.json` (one object; replace `<VERSION>` with the bumped semver and `<TODAY>` with the go-live date `YYYY-MM-DD`):

```json
[
  {
    "version": "<VERSION>",
    "release_date": "<TODAY>",
    "platform": "Both",
    "title": "Tambah rapat ke Google Calendar",
    "notes": "Sekarang tiap rapat punya tombol “Add to Google Calendar” — sekali ketuk, rapat langsung terisi di kalender Google kamu (judul, waktu, durasi, catatan, dan peserta sebagai tamu) tinggal Simpan (/m & /w)"
  }
]
```

- [ ] **Step 3: Insert loop-free (single self-contained line)**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/gcal-release.json"))])
frappe.db.commit()
EOF
```

- [ ] **Step 4: Verify through the real endpoint, per platform**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")[:1])
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Web")[:1])
EOF
```
Expected: the new row appears in both.

---

## Self-Review

**Spec coverage:**
- Mechanism (prefilled template link) → Task 1 `googleCalUrl`. ✓
- Field mapping (title/dates/estimated/notes/participants; no location) → Task 1 Step 3. ✓
- `null` on no start time; 30-min default; tz-neutral UTC math; hardcoded `Asia/Jakarta` → Task 1 code + self-check cases 1,3,4,5. ✓
- Button per frontend, hidden when null or Done, all render sites → Task 2 (component + 5 wirings). ✓ (spec named 4 sites "+ MeetingSheet action area"; plan wires all 5 including MeetingSheet, which is the shared web+mobile detail sheet.)
- Self-check matching `focusMerge.selfcheck.ts` → Task 1. ✓
- Ship: build both + App Release, no gen_docs/migrate/restart → Task 2 Steps 8–9, Task 3, Global Constraints. ✓

**Placeholder scan:** `<VERSION>`/`<TODAY>` in Task 3 are intentional runtime values (version depends on the live DB's newest row, date depends on go-live day) with explicit instructions to resolve them — not plan placeholders. No TBD/TODO/"handle edge cases" anywhere.

**Type consistency:** `googleCalUrl` / `GoogleCalMeeting` / `GoogleCalButton({ meeting, className })` used identically across Tasks 1–2. `MeetingListItem` structurally satisfies `GoogleCalMeeting` (has title, scheduled_at, estimated, notes?, participants). ✓
