# Add Meeting to Google Calendar

**Date:** 2026-07-20
**Status:** Approved design

## Goal

Let a user add an existing Vernon meeting to their own Google Calendar with one tap,
with no login, no backend, and no stored credentials.

## Mechanism (decided)

**Prefilled Google Calendar template link.** A button on each meeting card links to
`https://calendar.google.com/calendar/render?action=TEMPLATE&...`. Tapping opens Google's
own new-event page, pre-filled from the meeting, in whatever Google account the user is
signed into. They press **Save**. Nothing is stored on our side.

Rejected alternatives:
- **Universal `.ics` download** — works for Apple/Outlook too, but more code and weaker
  guest-invite semantics. Add later if cross-provider support is requested.
- **Full OAuth Google Calendar API sync** — auto-push, auto-invite, two-way sync. Weeks of
  work plus OAuth tokens/refresh/Google Cloud project to maintain. Not justified.

## Data source

Meeting fields already present (no schema change):

| Meeting field | Google param |
|---|---|
| `title` | `text` |
| `scheduled_at` (Datetime, site tz) | `dates` START |
| `estimated` (Int, minutes) | `dates` END = START + estimated |
| `notes` (Small Text) | `details` |
| `participants` (User ids = emails) | `add` (guests) |

Meeting has **no** location or URL field — `location` param is omitted.

## Component 1 — shared URL builder

`frontend/src/lib/googleCal.ts` — pure function, imported by both frontends via `@`.

```
googleCalUrl(m: {
  title: string
  scheduled_at: string | null
  estimated?: number
  notes?: string
  participants?: string[]
}): string | null
```

Rules:
- Returns `null` when `scheduled_at` is falsy — without a start time there is no event.
- `dates` is basic wall-clock format `YYYYMMDDTHHMMSS` (no `Z`), paired with `ctz`.
  - START = `scheduled_at` with `-`, `:`, and the space→`T` stripped to `YYYYMMDDTHHMMSS`.
  - END = START plus `estimated` minutes. Duration arithmetic uses `Date.UTC(y,mo,d,h,mi)`
    → epoch → `+ estimated*60000` → read back `getUTC*`. Using UTC for the math keeps it
    tz-neutral: the viewer's browser timezone / DST cannot corrupt the wall-clock delta.
  - `estimated` falsy (0 / null / undefined) → default **30** minutes.
- `ctz` = **`Asia/Jakarta`** — hardcoded. Site is single-tenant Indonesia (UTC+7, no DST).
  Makes Google place the event at the correct wall-clock regardless of the viewer's browser
  timezone. (Upgrade path: read `time_zone` from boot if the site ever moves timezone.)
- `details` = `notes`, omitted when empty.
- `add` = `participants` joined by `,`, omitted when empty. Frappe User id is the email.
- All values `encodeURIComponent`-ed.

## Component 2 — button (presentation per frontend)

Plain anchor, opens in a new tab:

```jsx
<a href={url} target="_blank" rel="noopener">Add to Google Calendar</a>
```

- Rendered in the meeting card action row, styled per platform (both are soft-pop now).
- **Hidden** when `googleCalUrl(...)` returns `null`, or when `status` is Done (past meeting).
- Web: `frontend-web/src/pages/Meetings.tsx` card, and `frontend-web/src/components/ProjectMeetings.tsx`.
- Mobile: `frontend/src/pages/MeetingsScreen.tsx` card, and the mobile
  `ProjectMeetings.tsx` / `MeetingSheet.tsx` action area.

(Behaviour lives in the shared builder; each frontend owns only the anchor's look, per the
project's two-frontend rule.)

## Component 3 — self-check

`frontend/src/lib/googleCal.selfcheck.ts`, assert-based, matching the existing
`focusMerge.selfcheck.ts` pattern. Covers:
- START/END formatting from a known `scheduled_at`.
- END = START + estimated, including an hour/day rollover case.
- `estimated` 0 → 30-min default.
- `null` return when `scheduled_at` is missing.
- guests present / omitted; details omitted when notes empty.
- output is a valid `render?action=TEMPLATE` URL with encoded params.

## Out of scope

- Location (no field), `.ics` / Apple / Outlook, OAuth two-way sync.
- No backend change → no `gen_docs.py`, no migrate, no `bench restart`.

## Ship

1. Build both bundles (`frontend` + `frontend-web`).
2. Insert an **App Release** row (What's New): Bahasa, platform `Both`, semver bump,
   `published=1`. One bullet — user can now add a meeting to Google Calendar in one tap.
