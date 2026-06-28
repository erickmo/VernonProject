# QR Attendance — Design Spec

**Date:** 2026-06-28
**Status:** Approved design, pre-implementation
**App:** vernon_project (Frappe, live site project.vernon.id)

## Summary

Employee attendance via **dynamic rotating QR codes** shown at physical stations.
Each station displays a QR that rotates every N seconds (validity set in settings);
employees scan it with the mobile app. Scans are matched against **shift-based
working schedules** to compute late / leave-early / absence, with **point penalties**
deducted per minute (or flat for absence). The system accounts for **public holidays**
(per brand — not all close), **work-from-home**, and **approved leave**. Schedules can
be set or edited *after* a date has passed and the affected days **recalculate**.
Schedule management and the attendance report live on a **separate admin page** (web `/w`).

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Scan flow | Station shows a rotating QR; employee scans with mobile app. |
| Schedule model | Shared **Shift Templates**, assigned per employee, effective-dated. |
| Station binding | Any station counts; station is recorded, never enforced. |
| Excused days | Lightweight, User-centric doctypes (no ERPNext HR coupling). |
| Holiday scope | Per **brand** — Holiday List attaches to Brand; employee's brand set on their Attendance Profile. |
| Scans per day | Many allowed; earliest = check-in, latest = check-out. |
| Penalty storage | Negative **Point Ledger** row (`source=Attendance`), reusing existing idempotent-upsert pattern. |
| Architecture | Raw immutable scans + recomputable derived Daily Attendance. |

## Existing-code anchors

- **Settings:** `Vernon Settings` single doctype — add attendance fields here.
- **Points:** `Point Ledger` (fields `user, role, todo, meeting, source, point, points_earned, late_days, early_days`). Balance = live sum of `points_earned` in `vernon_project/api/mobile.py:_user_balance`. Idempotent upserts keyed `(todo, role)` / `(meeting, participant)` — attendance mirrors this with a new `attendance` link field.
- **People:** core **User** doctype (points attach to User). Brand is a vernon_project doctype (`brand_name`). A User has **no direct brand link** — so attendance needs an explicit employee→brand assignment.
- **Frontends:** `/m` mobile (React, React Router 6, Soft-Pop tokens, react-query, `api/mobile.py` whitelisted methods); `/w` web (React, AppShell, BentoGrid/BentoTile, admin-gated routes). No QR library installed in either.
- **Scheduler:** nightly jobs live in `tasks.py` (same path as todo recurrence).

## Architecture

**Approach A — raw scans + recomputable derived layer.** Immutable `Attendance Scan`
events are the source of truth for "who scanned, where, when". A derived `Daily
Attendance` row per (employee, date) is *regenerated* from scans + schedule + holidays
+ exceptions by a single pure function. Penalties are idempotent negative Point Ledger
rows. Retroactive schedule edits "just work" because the derived row is always rebuilt
from current sources.

Rejected: (B) single Attendance doctype computed at write time — retroactive edits
scatter re-save logic and risk the `db_set`-in-`on_change` recursion gotcha; (C)
compute-on-the-fly with no stored row — penalties must persist anyway and the report
gets slow at scale.

## Data model

### New doctypes (vernon_project)

**Attendance Station** — a physical scan point.
- `station_name` (Data, reqd)
- `location` (Small Text)
- `secret_key` (Data, server-only — HMAC signing key, generated on insert, never sent to any client)
- `display_key` (Data — per-station key the kiosk page uses to fetch live tokens)
- `active` (Check, default 1)

**Shift Template** — reusable time window.
- `shift_name` (Data, reqd)
- `start_time` (Time, reqd)
- `end_time` (Time, reqd)

**Attendance Profile** — per-employee enrollment, one per User.
- `user` (Link User, reqd, unique)
- `brand` (Link Brand, reqd — employer-for-attendance; drives which holidays apply)
- `enrolled_from` (Date, reqd)
- `active` (Check, default 1)

**Shift Assignment** — effective-dated schedule rows.
- `employee` (Link User, reqd, search_index)
- `shift_template` (Link Shift Template, reqd)
- weekday Check fields `monday`…`sunday` (one assignment can cover several days; an unchecked weekday = not a working day under this assignment)
- `effective_from` (Date, reqd)
- `effective_to` (Date, optional — open-ended until superseded)

**Holiday List** + **Holiday** (child).
- list: `list_name` (Data, reqd); `holidays` (Table → Holiday)
- child Holiday: `date` (Date, reqd), `description` (Data)

**Attendance Exception** — WFH / Leave.
- `employee` (Link User, reqd)
- `from_date` (Date, reqd), `to_date` (Date, reqd)
- `type` (Select: `WFH` | `Leave`, reqd)
- `reason` (Small Text)
- `status` (Select: `Pending` | `Approved` | `Rejected`, default Pending)
- `approver` (Link User)

**Attendance Scan** — raw immutable event (never edited after insert).
- `employee` (Link User, reqd, search_index)
- `station` (Link Attendance Station, reqd)
- `timestamp` (Datetime, reqd — **server** time)
- `token_counter` (Int — the validated TOTP counter)

**Daily Attendance** — derived, recomputable, one per (employee, date).
- `employee` (Link User, reqd, search_index)
- `date` (Date, reqd, search_index)
- `shift_template` (Link — snapshot of the assignment used)
- `expected_start` (Datetime), `expected_end` (Datetime)
- `status` (Select: `OffDay` | `Holiday` | `Excused-WFH` | `Excused-Leave` | `Present` | `Late` | `EarlyLeave` | `Late+EarlyLeave` | `Absent`)
- `first_scan` (Datetime), `last_scan` (Datetime)
- `station_first` (Link), `station_last` (Link)
- `late_minutes` (Int), `early_minutes` (Int)
- `penalty_points` (Float)
- Unique constraint on `(employee, date)`.

### Extensions to existing doctypes

- **Brand** — add `holiday_list` (Link Holiday List). Whose holidays apply = employee's brand's list. "Not all companies close" = different brands link different lists (or none).
- **Point Ledger** — add `Attendance` to `source` Select; add `attendance` (Link Daily Attendance, search_index). Penalty row upserts idempotently keyed on `attendance`; `points_earned` is negative.

### Resolution chains

- **Whose holidays?** employee → Attendance Profile → `brand` → `brand.holiday_list`.
- **Expected schedule for date D?** Shift Assignment where `effective_from ≤ D ≤ effective_to` (or open) **and** weekday(D) is covered. None → off day.
- **Station for a scan?** stored on the scan; never enforced.

## Dynamic QR token

Stateless **HMAC-TOTP**, Python stdlib only (`hmac`, `hashlib`) — no new dependency.

```
window  = Vernon Settings.qr_validity_seconds          # e.g. 30
counter = floor(server_now_epoch / window)
token   = HMAC_SHA256(station.secret_key, str(counter))[:8 hex]
QR payload = { station_id, counter, token }
```

**Kiosk display:** a `/w` route (or lightweight Frappe web page) renders one station's QR
and refreshes every few seconds. It fetches the live payload from a station-scoped
endpoint authorized by the station's `display_key`. The signing `secret_key` never
leaves the server.

**Scan validation (server, in `attendance_scan` whitelisted method):**
1. Require an enrolled, logged-in user (has active Attendance Profile) — else reject `"not enrolled in attendance"`.
2. Recompute expected token for `station.secret_key`; accept `counter ∈ {now, now−1}` (one window of clock-skew tolerance). Mismatch → reject stale/forged QR.
3. Create `Attendance Scan` (employee, **server timestamp**, station, counter). Never trust client time.
4. Recompute `(employee, today)`; return resulting status.

## Recompute engine + penalty

Single pure function `recompute_daily(employee, date)` — deterministic, idempotent,
safe to run repeatedly.

```
1. assignment = effective Shift Assignment for (employee, date, weekday)
   none → status = OffDay, penalty = 0 ; upsert ; return
2. exception = approved Attendance Exception covering date
   Leave → status = Excused-Leave, penalty = 0 ; upsert ; return
   WFH   → status = Excused-WFH,   penalty = 0 ; upsert ; return   (no scan required)
3. date ∈ brand.holiday_list → status = Holiday, penalty = 0 ; upsert ; return
4. working day:
   scans = Attendance Scan for (employee, date), sorted by timestamp
   none → status = Absent, penalty = absence_penalty
   else:
     check_in  = earliest ; check_out = latest
     late_min  = max(0, minutes(check_in  − expected_start) − grace_minutes)
     early_min = max(0, minutes(expected_end − check_out)   − grace_minutes)
     penalty   = late_min * late_penalty_per_minute + early_min * early_leave_penalty_per_minute
     status    = Present | Late | EarlyLeave | Late+EarlyLeave
5. upsert Daily Attendance (employee, date)
6. upsert Point Ledger (source=Attendance, attendance=row, points_earned = −penalty)
```

All rates / grace / absence from Vernon Settings. Minutes floored to integer; all time
math in site timezone; `now`/`date` always server-side.

### Recompute triggers ("set schedule after the date, recalculate")

- **On scan** → recompute `(employee, today)` live so the employee sees status instantly.
- **On Shift Assignment / Attendance Exception / Holiday List save** → recompute every
  affected `(employee, date)` in range, **limited to past/today dates within enrollment**
  (never future, never pre-enrollment). This is what makes a retroactively-set schedule
  recalculate its days.
- **Nightly scheduler** (`tasks.py`) → recompute *yesterday* for all enrolled employees,
  finalizing absences for anyone who never scanned.

### Recursion safety

Recompute is a plain function called from hooks. It writes only to `Daily Attendance`
and `Point Ledger` — never back into the doctype whose `on_change` triggered it.
Holiday/Assignment/Exception `on_update` enqueue recompute of *other* docs only.
No self-write loop (avoids the known `db_set`-in-`on_change` gotcha).

### Idempotency

`Daily Attendance` keyed `(employee, date)`; Point Ledger keyed on `attendance`.
Re-running overwrites, never duplicates — same guarantee todos/meetings already rely on.

## Settings (Vernon Settings — new fields)

| Field | Type | Meaning |
|---|---|---|
| `attendance_enabled` | Check | master toggle |
| `qr_validity_seconds` | Int | token rotation window (default 30) |
| `attendance_grace_minutes` | Int | tolerance before late/early counts (default 5) |
| `late_penalty_per_minute` | Float | points/min late |
| `early_leave_penalty_per_minute` | Float | points/min early |
| `absence_penalty` | Float | flat points for a no-scan working day |

## Frontend

### Mobile `/m` (employee, Soft-Pop)

- **Scan screen** — camera opens, decodes QR (`html5-qrcode` — one dep, handles camera +
  decode; chosen over `jsqr` because it manages the camera stream), posts
  `{station, counter, token}`, shows a result card (lucide icon + `animate-pop`):
  *"Checked in 07:58 · on time"* / *"Late 6 min · −12 pts"* / *"Checked out 17:30"*.
- **My Attendance screen** — recent days: date · status pill · late/early min · penalty;
  tap for detail.
- **Request leave / WFH** — small form → creates `Attendance Exception` (Pending); shows
  approval state.

### Web `/w` (admin — the "separate page", BentoGrid)

- **Attendance Report** — filters (date range, brand, employee, status); BentoStat tiles
  (present / late / absent counts, total penalty pts); paginated Daily Attendance table;
  CSV export.
- **Schedules** — manage Shift Templates + Shift Assignments (effective-dated editor).
- **Stations** — CRUD; "Open kiosk display" → fullscreen rotating-QR page for that station.
- **Exceptions queue** — approve/reject pending WFH/Leave (approval triggers recompute of
  covered dates).
- **Holiday Lists** — manage lists + dates; link to Brand.

### Backend API

New whitelisted methods in `vernon_project/api/mobile.py` (existing pattern):
`attendance_scan`, `my_attendance`, `request_exception`; station kiosk token endpoint
authorized by per-station `display_key`; admin `/w` reads via data hooks. Employee
screens for any enrolled User; `/w` admin pages gated like existing admin routes.

## Edge cases (decided)

- Not enrolled → scan rejected `"not enrolled in attendance"`.
- Scan on OffDay / Holiday / approved Leave → scan still stored, status stays excused, penalty 0.
- WFH day → excused, no scan required; scanning anyway stays excused.
- Brand with no `holiday_list` → no holidays; every assigned day is a working day.
- Future-dated schedule changes recompute nothing until the date arrives (nightly job picks them up).

## Out of scope (v1 — add when asked)

- Overnight shifts (`end < start` crossing midnight) — v1 assumes same-day shifts; configuring otherwise raises a clear error.
- Half-day / partial leave, multiple shifts per day, geofencing/GPS, photo-on-scan.

## Testing

Per the live-site norm (defer tests to final phase) — with one exception, because the
penalty path is money:

- One focused `test_*.py` on the pure `recompute_daily`: on-time, late, early, both,
  absent, holiday, leave, WFH, off-day, and a **retroactive schedule edit recalculating a
  past day**. Pure function, no fixtures → cheap, high value.

UI, QR kiosk, and API endpoints verified manually on the live site in the final phase.
