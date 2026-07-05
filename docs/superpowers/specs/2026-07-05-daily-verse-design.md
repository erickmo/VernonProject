# Daily Verse (Ayat Harian) — Design

**Date:** 2026-07-05
**Status:** Approved, pending implementation plan

## Purpose

Let each user opt in to a daily scripture verse ("Ayat Harian"), shown on the
mobile (/m) and web (/w) home screens. The verse matches the user's religion and
is delivered in Bahasa Indonesia. Off by default; the user turns it on in their
personal settings.

## Decisions (locked)

| Question | Decision |
|----------|----------|
| Verse source | External Bahasa-Indonesia API |
| Religion coverage | API-only for the 3 religions with a Bahasa API: **Islam, Kristen, Katolik**. Hindu/Buddha/Konghucu: toggle hidden, feature unavailable until an API exists. |
| Surface | Home card on /m and /w |
| Religion storage | `religion` Select on Employee Profile (6 official Indonesian religions) |
| Verse cache | New `Daily Verse` doctype, one row per (religion, date) |
| Language | Bahasa Indonesia |

## Data Model

### Employee Profile — two new self-editable fields

Added to `personal_section`, both **permlevel 0** (user edits their own):

- `religion` — Select, label **"Agama"**, options:
  `\nIslam\nKristen\nKatolik\nHindu\nBuddha\nKonghucu` (blank default)
- `verse_enabled` — Check, label **"Tampilkan Ayat Harian"**, default `0`

Religion is stored for all 6 even though only 3 receive verses today — so the
feature widens automatically when more APIs are added, and religion is a
generally useful profile attribute.

### New doctype: `Daily Verse`

Backend-written cache. Never edited from the app UI (read-only to users;
created by the fetch code with `ignore_permissions`).

- **autoname:** `format:{religion}-{verse_date}` → guarantees one row per
  religion per day, and gives an idempotent key for lookup.
- Fields:
  - `religion` — Data (or Select mirroring the 6)
  - `verse_date` — Date
  - `reference` — Data (e.g. `QS Al-Baqarah 2:286`, `Yohanes 3:16`)
  - `text` — Small Text (Bahasa translation, HTML-stripped)
  - `source` — Data (which API produced it, for audit)

Rows are effectively immutable once written. No cleanup job in v1 (a row per
religion per day is trivial volume). `ponytail:` add a retention purge only if
volume ever matters.

## Backend

New module `vernon_project/api/verse.py`.

```
SUPPORTED = {"Islam", "Kristen", "Katolik"}
```

### `get_daily_verse()` — whitelisted

1. `user = frappe.session.user`; Guest → return `None`.
2. Read `verse_enabled`, `religion` from that user's Employee Profile
   (`frappe.db.get_value`).
3. If not enabled **or** religion not in `SUPPORTED` → return `None`.
4. `today = frappe.utils.today()`; `name = f"{religion}-{today}"`.
5. If `Daily Verse` `name` exists → return `{reference, text}` from it.
6. Else fetch from the religion's source → insert `Daily Verse`
   (`ignore_permissions=True`) → return.
   - On fetch failure: `frappe.log_error` and return `None`. **Do not cache the
     failure** — the next request retries, so a transient outage self-heals.
   - Race (two requests fetch the same day/religion at once): catch
     `DuplicateEntryError` on insert, re-read the existing row, return it.

Returns `{reference: str, text: str}` or `None`. `None` means "show nothing."

### Fetchers

- **Islam** → quran.com v4: `GET https://api.quran.com/api/v4/verses/random`
  with `language=id&translations=33&fields=verse_key` (translation 33 = Kemenag
  Indonesian). Any verse is spiritually appropriate; a random verse cached once
  per day is fine. `reference = f"QS {verse_key}"`, `text` = translation.
- **Kristen / Katolik** → shared curated list of ~80 well-known Bible references
  (John 3:16, Mazmur 23, Filipi 4:13, …). Pick one deterministically by a hash
  of `verse_date` (index = `hash(date) % len(list)`), then fetch its Bahasa text
  (Terjemahan Baru) from an Indonesian Alkitab API. The curated list avoids
  obscure/genealogy verses and guarantees a meaningful daily verse for both
  Kristen and Katolik (same Bible).
  - Exact Alkitab endpoint chosen at implementation time (candidates: Beeble,
    api.alkitab). Requirement: TB Indonesian, passage-by-reference lookup.

Determinism: the picker uses a hash of the date string, **not** `Math.random`/
`random` — so concurrent workers pick the same verse and the cache write is
idempotent. `requests` (bundled with Frappe) with an 8s timeout. Verse text is
HTML/footnote-tag stripped before storage.

### `update_my_profile(...)` — extend existing self-service method

Add `religion=None`, `verse_enabled=None` params. Set both on the Employee
Profile doc (permlevel 0, so self-edit is allowed). Cast `verse_enabled` to int.
No change to the admin `update_employee_profile` path.

### Self-profile read

The screen that renders the settings toggle needs current `religion` +
`verse_enabled`. Add both fields to whatever payload the self-profile screen
already reads (bootstrap or a `get_my_profile`-style method). Exact insertion
point confirmed at plan time.

## Frontend

Shared data hook, per-design-system presentation.

### Types (`@/lib/types`, shared by /m and /w)

- Extend the self-profile/settings type with `religion: string`,
  `verse_enabled: 0 | 1`.
- `DailyVerse = { reference: string; text: string } | null`.

### API + hook

- `mobileApi.dailyVerse = () => api.get(M + 'get_daily_verse')`.
- `mobileApi.updateMyProfile` gains `religion` + `verse_enabled`.
- `useDailyVerse()` in `useData.ts`: react-query, long `staleTime` (once/day),
  `enabled` only when settings are loaded, `verse_enabled` is on, and religion is
  supported — so unsupported religions never hit the endpoint.

### Settings toggle (self-profile screen)

- "Agama" Select + "Ayat Harian" toggle.
- Toggle active only when religion ∈ SUPPORTED. For Hindu/Buddha/Konghucu, hide
  the toggle and show a muted note **"Belum tersedia untuk agama ini"** — this is
  the "API-only, 3 religions" behavior.

### Home cards (thin, per-system — not force-shared)

Two design systems, so two small presentational components fed by the one hook:

- **/m `Today.tsx`** — `VerseCard` in Soft Pop paper-* style, lucide `BookOpen`
  icon, shows `text` + `reference`. Renders only when the hook returns a verse.
- **/w `Home.tsx`** — verse block in flat-Notion semantic tokens
  (canvas/surface/ink/muted/line). Renders only when the hook returns a verse.

## Edge Cases & Errors

- **API down / timeout:** `get_daily_verse` returns `None` → card silently
  hidden. No error toast. Logged server-side.
- **Failure never cached:** transient outages retry next request.
- **First-fetch race:** duplicate insert caught, existing row re-read.
- **Religion switched to unsupported after enabling:** card hidden, toggle shows
  the "belum tersedia" note. `verse_enabled` may stay 1 harmlessly.
- **Verse text sanitized:** strip HTML/footnote tags from API translation before
  storing.

## Testing & Rollout

Live site, code-first — heavy tests deferred per project convention. One small
`test_verse.py` covering the pure logic:

- date→index picker is deterministic (same date ⇒ same index).
- HTML/footnote strip produces clean text.

Fetchers are network-bound → verified manually on deploy.

**Deploy sequence:** `bench migrate` (new doctype + Employee Profile fields) →
`bench restart` (new Python) → `npm run build` for /m and /w (new frontend).

## Explicitly Out of Scope (v1)

- Daily **push notification** — home card only. Add when morning push is wanted.
- Verses for **Hindu / Buddha / Konghucu** — no Bahasa API. Add when one exists
  (design already leaves religion stored + a `SUPPORTED` set to widen).
- A **single shared card component** — the two design systems differ enough that
  two thin views + one shared hook is less code than a bridged component.
- `Daily Verse` **retention/purge** job — volume is negligible.
