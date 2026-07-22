# Leave categories, per-Brand annual quota, and Cuti Bersama auto-pull

**Date:** 2026-07-20
**Status:** Approved, implementing

## Goal

Leave already has categories (Leave Type) each with a quota. Two additions:

1. **Cuti Bersama** — Indonesian government-mandated collective leave days. They are a
   company-wide day off (no attendance penalty) **and** deduct one day each from the
   employee's annual leave quota. Auto-pulled per year from a public holiday API.
2. **Per-Brand annual quota** — the default annual leave quota moves from a single global
   Vernon Settings value to a per-Brand field. Holidays (incl. cuti bersama) are already
   per-Brand via `Brand.holiday_list`, so leave config now lives at the Brand level.

Plus: card-ify the mobile Settings screen (web already uses bento cards).

UI ships to **both** frontends (mobile `frontend/`, web `frontend-web/`).

## Data model (fields only — no new DocType)

- **Attendance Holiday** (child of Attendance Holiday List): add
  `is_cuti_bersama: Check` (default `0`, `in_list_view: 1`).
- **Brand**: add `default_annual_leave_quota: Int` (default `0`; `0` = fall back to the app
  default of 12).
- **Vernon Settings**: remove `default_annual_leave_quota` (retired — no longer read).

Migration: `bench migrate` adds the two columns. One-time backfill: copy the old global
Vernon Settings quota into every Brand whose `default_annual_leave_quota` is still 0, so
existing behaviour is preserved.

## Quota resolution — `vernon_project/attendance/leave_quota.py`

Single source of truth, consumed by both `_leave_balance` (display) and `check_request`
(enforcement).

- `_brand_for(employee)`: the employee's active `Attendance Profile.brand` (or `None`).
- `effective_quota(employee)`: employee override (`Employee Profile.annual_leave_quota`,
  non-zero) → **Brand** `default_annual_leave_quota` (non-zero) → `DEFAULT_QUOTA` (12).
  Stop reading Vernon Settings.
- `cuti_bersama_days(employee, year)`: count `Attendance Holiday` rows where
  `parent = <employee's brand holiday_list>`, `is_cuti_bersama = 1`, and `holiday_date`'s
  year `== year`, **restricted to dates the employee is shift-assigned that weekday** —
  reuse `engine._assignment_for(employee, date)`, and do **not** apply `_is_holiday`
  (cuti bersama *is* the holiday). No brand / no assignments → 0 (consistent with
  `working_days` returning 0 for non-attendance users).
- Deduction: cuti bersama is folded into the **used** side of the annual pool.
  `remaining = quota − used − cuti_bersama`. Apply in both consumers:
  - `check_request`: in the `t.is_default_annual` branch, add
    `cuti_bersama_days(employee, year)` to `used`.
  - `_leave_balance` (mobile.py): include cuti bersama in `used`, and add a
    `cuti_bersama` field to the payload for transparency.
- The **day-off** behaviour is free: cuti bersama are holiday rows, so
  `engine._is_holiday` already suppresses absence/late penalties. No attendance-engine
  change.

## Auto-pull endpoint — `vernon_project/api/attendance.py`

Source: **Google's public Indonesian holiday calendar (ICS)** —
`https://calendar.google.com/calendar/ical/id.indonesian%23holiday%40group.v.calendar.google.com/public/basic.ics`.
The `id.` (Bahasa) feed names entries in Indonesian **and** includes the "Cuti Bersama …"
days; the `en.` feed omits cuti bersama entirely. (The originally-planned
`dayoffapi.vercel.app` / `api-harilibur.vercel.app` JSON APIs were both dead —
HTTP 402 `DEPLOYMENT_DISABLED` — at build time, so the ICS feed was used instead.)

```python
@frappe.whitelist()
def sync_holidays(list_name, year):
    # gate: _is_hr(frappe.session.user) else PermissionError
    # fetch the id.indonesian Google ICS (requests, timeout=15)
    # parse VEVENTs: pair each DTSTART (YYYYMMDD) with its SUMMARY, keep the target year
    #   is_cuti_bersama = "cuti bersama" in summary.lower()  (description = the Bahasa name)
    # upsert into Attendance Holiday List `list_name` by date:
    #   exists -> update description + is_cuti_bersama ; missing -> append child row
    #   dedup repeated dates within the feed; preserve manual rows not in the feed
    # return {"status": "ok", "added": n_added, "updated": n_updated}
```

- Outbound HTTP is already used on this site (Daily Verse, Midtrans) — allowed.
- On fetch failure or an empty year: `frappe.throw` a Bahasa message; don't partially write.
- `frappe.db.commit()` after save. Verified live: 2026 → 28 holidays, 7 cuti bersama flagged,
  idempotent on re-sync.

## Frontend — both platforms

Shared call (add to `mobileApi` in `frontend/src/lib/api.ts`, near the leave methods):

```ts
syncHolidays: (list_name: string, year: number) =>
  api.post<{ status: string; added: number; updated: number; message?: string }>(
    A + 'sync_holidays', { list_name, year }),
```

Both admin screens — mobile `frontend/src/pages/AttendanceHolidaysScreen.tsx` and web
`frontend-web/src/pages/HolidayLists.tsx` (both already import `resource` from `@/lib/api`
and manage Attendance Holiday List + Brand):

- **Sync button** per holiday list: a year input (default current year) + "Sync {year}"
  button calling `mobileApi.syncHolidays(list, year)`, then reload rows and toast the
  added/updated count.
- **View rows**: load the list's holiday rows (`resource.get('Attendance Holiday List',
  name)` → `holidays` child table) and render each with date + description + a
  **"Cuti Bersama" badge** when `is_cuti_bersama`.
- **Manual toggle**: when adding/editing a holiday row by hand, an `is_cuti_bersama`
  checkbox.
- **Per-Brand quota**: beside the existing brand → holiday-list assign control, an
  Int input bound to `Brand.default_annual_leave_quota` saved via
  `resource.update('Brand', name, { default_annual_leave_quota })`.

Each screen uses its own platform design system: mobile Soft-Pop cards, web bento tiles.

Mobile Settings — `frontend/src/pages/SettingsScreen.tsx`: convert the flat
`border-t`-divided sections into cards (Soft-Pop `bg-paper-card shadow-card` tiles),
matching the web bento layout. Web `Settings.tsx` already uses `BentoTile` → unchanged
(the one inherent asymmetry, per the CLAUDE.md both-frontends rule).

## Follow-ups (per CLAUDE.md)

- New whitelisted endpoint `sync_holidays` → rerun `python3 scripts/gen_docs.py`, commit
  `docs/assets/data.js`.
- After it's live: add an `App Release` "What's New" row (Bahasa, `Both`, published),
  semver-bumped.

## Deliberately skipped

- Per-year quota history — single Int; add when year-tagging is asked.
- Web Settings relayout — already cards.
- Caching the holiday-API response — one manual click per year, no profiler says so.
