# Per-Brand Weekday Minimums + Skip 0-Value Days on Recurrence

Date: 2026-07-20
Status: Approved (design)

## Problem

Two asks:

1. **Per-Brand daily minimum work.** The per-weekday minimum estimated minutes
   (Mon–Sun) currently live globally on Vernon Settings
   (`min_minutes_<weekday>`). Move that authority to **each Brand** — every
   brand carries its own 7 weekday minimums, like the settings did.
2. **No recurrence on a 0-value day.** When a recurring todo's next occurrence
   would land on a weekday whose minimum is 0 (a day the brand does not work),
   do not create the occurrence there — advance to the next working day.

## Decisions (from brainstorming)

- Per-weekday minimums become a **Brand property**, replacing the single global
  set. A Brand weekday value is **authoritative**: `0` means "this brand does
  not work that day" (drives the no-recurrence rule), not "inherit".
- **Brand-only.** The 7 global weekday fields on Vernon Settings are **removed**.
  Users with no Brand fall back to the flat `min_daily_estimated_minutes`
  (single global number, unchanged).
- **Migration safety (approved):** a one-time patch copies the current global
  weekday values onto every existing Brand *before* the global fields are
  removed, so floors do not collapse on deploy day. If the globals were never
  set, brands simply start at 0 (same effective behavior as today).

## User → Brand mapping

Canonical, already used by `leave_quota.py` / `report.py`:

```python
brand = frappe.db.get_value("Attendance Profile", {"user": user, "active": 1}, "brand")
```

Users without an active Attendance Profile → no brand → flat fallback.

## Changes

### 1. Brand doctype
`vernon_project/vernon_project/doctype/brand/brand.json`

Add 7 `Int` fields with the **same fieldnames** as the old global ones so the
resolver constant is reused verbatim:

```
min_minutes_monday, min_minutes_tuesday, min_minutes_wednesday,
min_minutes_thursday, min_minutes_friday, min_minutes_saturday,
min_minutes_sunday
```

Grouped under a section (e.g. "Weekday Minimums"), each `Int`, non-negative,
default 0. No controller logic (`brand.py` stays empty).

### 2. Resolver — `_resolve_min_minutes(user, date)` (`api/report.py`)

Swap only the **base** computation; the shift-template override, holiday, and
off-weekday logic (`_daily_minimum`) are unchanged.

```python
wd = getdate(date).weekday()
brand = frappe.db.get_value("Attendance Profile", {"user": user, "active": 1}, "brand")
if brand:
    base = int(frappe.db.get_value("Brand", brand, WEEKDAY_MIN_FIELDS[wd]) or 0)  # 0 = off
else:
    base = int(frappe.db.get_single_value("Vernon Settings", "min_daily_estimated_minutes") or 0)
# unchanged from here:
is_holiday = ...
assignments = ...            # Shift Assignment covering this weekday
chosen = shift-template min if covering assignment else None
return _daily_minimum(is_holiday, bool(assignments), chosen, base)
```

`WEEKDAY_MIN_FIELDS` (`min_minutes_<weekday>`, Mon..Sun) is reused as-is — the
field names now name Brand columns.

Precedence: **covering Shift Template min → Brand weekday (0=off) → (no brand)
flat**. Holiday / shift-off weekday → 0, unchanged.

### 3. Remove global weekday fields
- `vernon_settings.json`: drop the 7 `min_minutes_<weekday>` fields (and the
  `weekday_minimums_section` that groups them) from fields + `field_order`.
- `api/mobile.py`: remove the 7 keys from `get_app_settings` and the 7 params +
  `int_fields` entries from `save_app_settings`.
- Frontend: remove the "Minimum Minutes per Weekday" block from
  `frontend/src/pages/SettingsScreen.tsx` and `frontend-web/src/pages/Settings.tsx`,
  plus any related state/type keys.

### 4. Brand form gains the 7 fields (both frontends)
- `frontend/src/lib/types.ts`: add the 7 optional numeric fields to `Brand`.
- `frontend-web/src/pages/BrandForm.tsx` and `frontend/src/pages/BrandFormScreen.tsx`:
  add 7 weekday minute inputs to the form state, load them from the fetched doc,
  include them in the create/update payload. Use the app's numeric-input and
  layout conventions of each frontend. `useCreateBrand`/`useUpdateBrand` payload
  types widen to carry them.

### 5. Skip 0-value days in recurrence — `generate_next` (`project_todo.py`)

After `next_date` is computed (including the existing resume /
`first_on_or_after` adjustment), step forward over 0-minimum days for the
occurrence's assignee:

```python
from vernon_project.api.report import _resolve_min_minutes   # lazy import (avoid cycle)
candidate = next_date
for _ in range(14):                                  # bound; guards a fully-0 brand
    if anchor.recurring_until and candidate > getdate(anchor.recurring_until):
        return None
    if _resolve_min_minutes(anchor.assigned_to, str(candidate)) > 0:
        next_date = candidate
        break
    candidate = getdate(next_occurrence(candidate, head._rule()))
else:
    pass  # all-zero within bound → keep the originally computed next_date (don't drop series)
```

- Bound `14` covers daily/weekly (all weekdays twice) and monthly (14 months).
- Applies to the assignee's **resolved** floor, so holidays and shift-off days
  are skipped for free — consistent with "not a work day for this person".
- The existing `not force and next_date > today` gate stays after this block:
  on the daily scheduler, a skipped-to future working day simply waits for its
  day; on-complete (`force=True`) pre-generates it. No livelock — the anchor
  deadline is fixed, so the target working day eventually arrives.

### 6. Migration patch
`vernon_project/patches/v1_0/brand_weekday_minimums.py` (+ `patches.txt` entry).

Before the doctype reload drops the global fields, read the current Single
values and write them onto every Brand:

```python
def execute():
    fields = ["min_minutes_monday", ..., "min_minutes_sunday"]
    vals = {f: int(frappe.db.get_single_value("Vernon Settings", f) or 0) for f in fields}
    for name in frappe.get_all("Brand", pluck="name"):
        frappe.db.set_value("Brand", name, vals, update_modified=False)
```

Idempotent enough for one run; ordering vs. the doctype sync handled by patch
placement (runs on migrate; `get_single_value` still reads the `tabSingles`
rows even after the field is removed from the doctype JSON).

## Tests

- `test_report.py`: update `_resolve_min_minutes` cases — brand user gets the
  Brand weekday value (incl. 0 = off); no-brand user gets flat; shift-template
  override still wins; holiday still 0.
- `test_recurrence.py` / `test_project_todo.py`: one case proving a next
  occurrence that lands on a 0-minimum weekday advances to the next working day;
  and the fully-0 brand fallback keeps the series (generates on computed date).

## Out of scope (YAGNI)

- No brand-level flat fallback (only per-weekday).
- No new brand holiday mechanism (existing `Brand.holiday_list` stays).
- Monthly recurrence on a 0-day jumps a whole month (uniform rule stepping);
  revisit only if a real case wants nearest-working-day instead.

## Ship checklist

- `python3 scripts/gen_docs.py` (expected no-op — no doctype/endpoint count
  change; commit only if `data.js` moves).
- What's New: one App Release row, Bahasa, `Both`, published=1, semver bump.
- `sudo /usr/local/bin/tj-restart` after Python + rebuild both frontend bundles.
