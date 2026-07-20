# Per-Brand Weekday Minimums + Skip 0-Value Recurrence Days — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the per-weekday minimum-estimated-minutes from global Vernon Settings onto each Brand (authoritative, 0 = day off), and stop recurring todos from landing on a 0-minute day for their assignee.

**Architecture:** One resolver (`_resolve_min_minutes`) reads the assignee's Brand (via Attendance Profile) as the per-weekday base, falling back to the flat global for users with no Brand. Recurrence reuses that resolver: a pure `advance_over_zero_days` helper in `recurrence.py` steps the occurrence date forward over 0-minute days, and `generate_next` wires it in. The 7 global weekday fields are removed; a migration seeds existing Brands from them first.

**Tech Stack:** Frappe (Python doctypes/patches), React + TypeScript (two frontends: `frontend/` = mobile `/m`, `frontend-web/` = web `/w`), Vite.

## Global Constraints

- **Live site, no test DB.** Site is `project.vernon.id`. Do NOT run pytest/`bench run-tests` against it. Only `recurrence.py` logic is unit-tested — it is frappe-free and runs standalone via `python -m …test_recurrence`. All other verification is `tsc`/build (frontend) or `bench console` spot-check (backend), done in the final ship task.
- **Brand weekday value is authoritative: `0` = that brand does not work that day** (no floor, and recurrence skips it). No "0 = inherit".
- **User → Brand** map is `frappe.db.get_value("Attendance Profile", {"user": user, "active": 1}, "brand")`.
- **Field names identical** to the old globals: `min_minutes_monday … min_minutes_sunday`, indexed Mon=0..Sun=6 (matches `date.weekday()`).
- **No native `<select>`/`alert`** conventions still apply (this change adds neither; forms use `toast`).
- **Deploy** = `bench migrate` (doctype JSON + patch) → `npm run build` both frontends → `sudo /usr/local/bin/tj-restart`. Assets are Cloudflare-cached — bump the service-worker `ASSET_CACHE` version and purge CF per the project deploy memory if the built hashes change.
- **After shipping** a user-visible change: one `App Release` row (Bahasa, `published=1`, `platform=Both`, semver bump). Run `python3 scripts/gen_docs.py` (expected no-op — no doctype/endpoint/hook count change).

---

### Task 1: Add 7 weekday-minute fields to the Brand doctype

**Files:**
- Modify: `vernon_project/vernon_project/doctype/brand/brand.json`

**Interfaces:**
- Produces: Brand columns `min_minutes_monday … min_minutes_sunday` (Int, non-negative, default 0), read by Task 2 (`_resolve_min_minutes`) and Task 4 (recurrence), written by Task 6 (patch) and Task 7 (forms).

- [ ] **Step 1: Add the section + 7 fields, and extend `field_order`.**

In `brand.json`, change `field_order` (line 8-10) to:
```json
 "field_order": [
  "brand_name", "company", "holiday_list", "weekday_minimums_section",
  "min_minutes_monday", "min_minutes_tuesday", "min_minutes_wednesday",
  "min_minutes_thursday", "min_minutes_friday", "min_minutes_saturday",
  "min_minutes_sunday"
 ],
```

And append these field defs inside `"fields"` (after the `holiday_list` field on line 21, before the closing `]`):
```json
  {"fieldname": "weekday_minimums_section", "fieldtype": "Section Break", "label": "Minimum Minutes per Weekday", "description": "Daily floor a member of this brand should plan, per weekday. Drives auto-plan, the daily-minimum banner, the assignment-overload warning, and skips recurring todos on 0 days. A member's Shift Template minimum overrides this; holidays count as 0. 0 = brand does not work that weekday."},
  {"fieldname": "min_minutes_monday", "fieldtype": "Int", "label": "Monday", "non_negative": 1, "default": "0"},
  {"fieldname": "min_minutes_tuesday", "fieldtype": "Int", "label": "Tuesday", "non_negative": 1, "default": "0"},
  {"fieldname": "min_minutes_wednesday", "fieldtype": "Int", "label": "Wednesday", "non_negative": 1, "default": "0"},
  {"fieldname": "min_minutes_thursday", "fieldtype": "Int", "label": "Thursday", "non_negative": 1, "default": "0"},
  {"fieldname": "min_minutes_friday", "fieldtype": "Int", "label": "Friday", "non_negative": 1, "default": "0"},
  {"fieldname": "min_minutes_saturday", "fieldtype": "Int", "label": "Saturday", "non_negative": 1, "default": "0"},
  {"fieldname": "min_minutes_sunday", "fieldtype": "Int", "label": "Sunday", "non_negative": 1, "default": "0"}
```
(Remember the comma after the `holiday_list` field's `}` on line 21.)

- [ ] **Step 2: Validate JSON.**

Run: `python3 -c "import json; json.load(open('vernon_project/vernon_project/doctype/brand/brand.json'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit.**

```bash
git add vernon_project/vernon_project/doctype/brand/brand.json
git commit -m "feat(brand): add per-weekday minimum-minutes fields"
```

---

### Task 2: Resolver reads Brand weekday base (fallback flat)

**Files:**
- Modify: `vernon_project/api/report.py:325-362` (`WEEKDAY_MIN_FIELDS` comment + `_resolve_min_minutes`)

**Interfaces:**
- Consumes: Brand fields from Task 1; `_daily_minimum(is_holiday, has_assignments, chosen, base)` (unchanged pure function).
- Produces: `_resolve_min_minutes(user, date) -> int` with the same signature; base now Brand-sourced. Consumed by Task 4.

- [ ] **Step 1: Update the constant comment (line 325).**

Replace:
```python
# Per-weekday global minimum fields on Vernon Settings, indexed by date.weekday() (Mon=0..Sun=6).
WEEKDAY_MIN_FIELDS = [
```
with:
```python
# Per-weekday minimum fields on Brand, indexed by date.weekday() (Mon=0..Sun=6).
WEEKDAY_MIN_FIELDS = [
```

- [ ] **Step 2: Swap the base computation in `_resolve_min_minutes` (lines 332-343).**

Replace the docstring + the `per_weekday`/`flat`/`global_min` lines:
```python
def _resolve_min_minutes(user, date):
	"""Per-user daily minimum estimated minutes for one date — the auto-plan / underperformed /
	assignment-overload floor. Global per-weekday floor (Vernon Settings min_minutes_<weekday>,
	falling back to the flat min_daily_estimated_minutes) is the base for everyone; a covering
	Shift Template.minimum_estimated_minutes overrides it for that user; holidays and non-shift
	weekdays (a user who has shifts but is off this weekday) -> 0. A user with no shift setup
	works every weekday and gets the per-weekday global."""
	wd = getdate(date).weekday()
	date = str(getdate(date))
	per_weekday = int(frappe.db.get_single_value("Vernon Settings", WEEKDAY_MIN_FIELDS[wd]) or 0)
	flat = int(frappe.db.get_single_value("Vernon Settings", "min_daily_estimated_minutes") or 0)
	global_min = per_weekday if per_weekday > 0 else flat
```
with:
```python
def _resolve_min_minutes(user, date):
	"""Per-user daily minimum estimated minutes for one date — the auto-plan / underperformed /
	assignment-overload floor, and the recurrence skip-a-0-day gate. The base is the user's
	Brand per-weekday minimum (Brand.min_minutes_<weekday>), which is authoritative: 0 = the
	brand does not work that weekday. Users with no Brand (no active Attendance Profile) fall
	back to the flat Vernon Settings min_daily_estimated_minutes. A covering Shift
	Template.minimum_estimated_minutes overrides the base for that user; holidays and non-shift
	weekdays (a user who has shifts but is off this weekday) -> 0."""
	wd = getdate(date).weekday()
	date = str(getdate(date))
	brand = frappe.db.get_value("Attendance Profile", {"user": user, "active": 1}, "brand") if user else None
	if brand:
		base = int(frappe.db.get_value("Brand", brand, WEEKDAY_MIN_FIELDS[wd]) or 0)
	else:
		base = int(frappe.db.get_single_value("Vernon Settings", "min_daily_estimated_minutes") or 0)
```

- [ ] **Step 3: Update the final return (line 362) to pass `base`.**

Replace:
```python
	return _daily_minimum(is_holiday, bool(assignments), chosen, global_min)
```
with:
```python
	return _daily_minimum(is_holiday, bool(assignments), chosen, base)
```

- [ ] **Step 4: Confirm no stray `global_min` reference remains.**

Run: `grep -n "global_min\|per_weekday\|get_single_value(\"Vernon Settings\", WEEKDAY" vernon_project/api/report.py`
Expected: no output.

- [ ] **Step 5: Byte-compile.**

Run: `python3 -m py_compile vernon_project/api/report.py && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit.**

```bash
git add vernon_project/api/report.py
git commit -m "feat(report): resolve min-minutes from Brand weekday, flat fallback"
```

---

### Task 3: Pure `advance_over_zero_days` helper (TDD)

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/recurrence.py`
- Test: `vernon_project/vernon_project/doctype/project_todo/test_recurrence.py`

**Interfaces:**
- Produces: `advance_over_zero_days(start, step, min_for, until=None, bound=14) -> date | None`. `step(date)->date` returns the next candidate strictly after; `min_for(date)->int`. Returns the first candidate with `min_for>0`; `None` if `until` (inclusive) is passed first; the original `start` if no working day within `bound` steps (degenerate all-zero — never drop the series). Consumed by Task 4.

- [ ] **Step 1: Write the failing test.**

Append to `test_recurrence.py` (before `def _run()`):
```python
def test_advance_over_zero_days():
    step = lambda d: d + timedelta(days=1)
    # Fri/Sat = 0, everything else 120. Start Fri -> first working day is Sun? no: Sun=120 here.
    mins = {SAT: 0, SUN: 0}  # weekday-indexed; others default 120
    min_for = lambda d: mins.get(d.weekday(), 120)
    # 2026-07-18 is a Saturday. Skip Sat(0), Sun(0) -> Mon 2026-07-20.
    assert advance_over_zero_days(date(2026, 7, 18), step, min_for) == date(2026, 7, 20)
    # Start on a working day -> returned unchanged.
    assert advance_over_zero_days(date(2026, 7, 20), step, min_for) == date(2026, 7, 20)
    # `until` passed before any working day -> None (series ended). Sat with until=that Sun.
    assert advance_over_zero_days(date(2026, 7, 18), step, min_for, until=date(2026, 7, 19)) is None
    # Degenerate: every day 0 -> keep the original start, never drop.
    assert advance_over_zero_days(date(2026, 7, 18), step, lambda d: 0) == date(2026, 7, 18)
    # Bound respected: only `bound` steps scanned before falling back to start.
    seen = []
    def counting(d):
        seen.append(d)
        return 0
    advance_over_zero_days(date(2026, 7, 18), step, counting, bound=3)
    assert len(seen) == 3
```

The `timedelta` import already exists at the top of `test_recurrence.py`? It imports only `date`. Add `timedelta`:
```python
from datetime import date, timedelta
```

- [ ] **Step 2: Add `advance_over_zero_days` to the test import.**

Change the import block (lines 6-8) to:
```python
from vernon_project.vernon_project.doctype.project_todo.recurrence import (
    Rule, next_occurrence, first_on_or_after, parse_weekdays, format_weekdays,
    advance_over_zero_days,
)
```

- [ ] **Step 3: Run the test — verify it FAILS.**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python -m vernon_project.vernon_project.doctype.project_todo.test_recurrence`
Expected: `ImportError` (cannot import `advance_over_zero_days`).

- [ ] **Step 4: Implement the helper.**

Append to `recurrence.py` (after `first_on_or_after`, end of file):
```python
def advance_over_zero_days(start, step, min_for, until=None, bound=14):
    """Advance `start` over days whose minimum is 0, for the recurrence skip rule.

    step:    date -> next candidate strictly after it (the rule's next_occurrence).
    min_for: date -> int minimum-minutes for that date (0 = day off).
    until:   inclusive series end, or None. bound: max candidates scanned.

    Returns the first candidate with min_for(candidate) > 0; None if `until` is
    passed before any working day (series is over); or the original `start` if no
    working day is found within `bound` steps (degenerate all-zero config — keep the
    date so the series is never silently dropped).
    """
    candidate = start
    for _ in range(bound):
        if until is not None and candidate > until:
            return None
        if min_for(candidate) > 0:
            return candidate
        candidate = step(candidate)
    return start
```

- [ ] **Step 5: Run the whole suite — verify PASS.**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python -m vernon_project.vernon_project.doctype.project_todo.test_recurrence`
Expected: all lines `… ok`, including `test_advance_over_zero_days ok`.

- [ ] **Step 6: Commit.**

```bash
git add vernon_project/vernon_project/doctype/project_todo/recurrence.py vernon_project/vernon_project/doctype/project_todo/test_recurrence.py
git commit -m "feat(recurrence): pure advance_over_zero_days skip helper + tests"
```

---

### Task 4: Wire the skip into `generate_next`

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py:862-879` (`generate_next`)

**Interfaces:**
- Consumes: `advance_over_zero_days` (Task 3), `next_occurrence` (recurrence.py), `_resolve_min_minutes` (Task 2).
- Produces: `generate_next` now generates the occurrence on the first working day (min>0) for `anchor.assigned_to`; holidays, brand days off, and shift-off days are skipped.

- [ ] **Step 1: Replace the date-finalization block.**

In `generate_next`, replace the current block (from `if anchor.recurring_until and next_date > getdate(anchor.recurring_until):` through the `not force` gate — lines 871-874):
```python
	if anchor.recurring_until and next_date > getdate(anchor.recurring_until):
		return None
	if not force and next_date > today:
		return None
```
with:
```python
	# Skip days the assignee does not work (brand weekday = 0, holiday, or shift-off).
	# advance_over_zero_days also owns the recurring_until bound.
	from .recurrence import advance_over_zero_days, next_occurrence
	from vernon_project.api.report import _resolve_min_minutes
	rule = head._rule()
	until = getdate(anchor.recurring_until) if anchor.recurring_until else None
	next_date = advance_over_zero_days(
		next_date,
		lambda d: getdate(next_occurrence(d, rule)),
		lambda d: _resolve_min_minutes(anchor.assigned_to, str(d)),
		until=until,
	)
	if next_date is None:
		return None
	if not force and next_date > today:
		return None
```

(The existing resume block just above — `if next_date < today: … first_on_or_after` — stays unchanged. The `head = frappe.get_doc(...)` on line 862 already gives us `head._rule()`.)

- [ ] **Step 2: Byte-compile.**

Run: `python3 -m py_compile vernon_project/vernon_project/doctype/project_todo/project_todo.py && echo OK`
Expected: `OK`

- [ ] **Step 3: Confirm the import is lazy (inside the function, no module-level cycle).**

Run: `grep -n "from vernon_project.api.report import" vernon_project/vernon_project/doctype/project_todo/project_todo.py`
Expected: the line appears **inside** `generate_next` (indented), not at column 0.

- [ ] **Step 4: Commit.**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.py
git commit -m "feat(recurrence): skip 0-minimum days for the assignee in generate_next"
```

---

### Task 5: Remove global weekday fields (backend)

**Files:**
- Modify: `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json:6,39-57`
- Modify: `vernon_project/api/mobile.py:2337-2343, 2408-2414, 2434-2440`

**Interfaces:**
- Produces: `get_app_settings`/`save_app_settings` no longer carry the 7 `min_minutes_<weekday>` keys. Flat `min_daily_estimated_minutes` stays. Consumed by Task 8 (frontend removal must match).

- [ ] **Step 1: Trim `vernon_settings.json` `field_order` (line 6).**

Remove `"weekday_minimums_section"` and the 7 `"min_minutes_<weekday>"` entries from the `field_order` array so it goes `… "under_occupied_tolerance_minutes", "attendance_section", …` directly.

- [ ] **Step 2: Delete the field defs (lines 39-57).**

Remove the `weekday_minimums_section` Section Break object and all 7 `min_minutes_<weekday>` field objects. The `under_occupied_tolerance_minutes` field (ends line 38) is now immediately followed by the `attendance_section` field (line 58-…).

- [ ] **Step 3: Validate JSON.**

Run: `python3 -c "import json; json.load(open('vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json'))" && echo OK`
Expected: `OK`

- [ ] **Step 4: Remove the 7 keys from `get_app_settings` (mobile.py lines 2337-2343).**

Delete these lines:
```python
		"min_minutes_monday": int(g("min_minutes_monday") or 0),
		"min_minutes_tuesday": int(g("min_minutes_tuesday") or 0),
		"min_minutes_wednesday": int(g("min_minutes_wednesday") or 0),
		"min_minutes_thursday": int(g("min_minutes_thursday") or 0),
		"min_minutes_friday": int(g("min_minutes_friday") or 0),
		"min_minutes_saturday": int(g("min_minutes_saturday") or 0),
		"min_minutes_sunday": int(g("min_minutes_sunday") or 0),
```

- [ ] **Step 5: Remove the 7 params from `save_app_settings` signature (lines 2408-2414).**

Delete these parameter lines:
```python
	min_minutes_monday=None,
	min_minutes_tuesday=None,
	min_minutes_wednesday=None,
	min_minutes_thursday=None,
	min_minutes_friday=None,
	min_minutes_saturday=None,
	min_minutes_sunday=None,
```

- [ ] **Step 6: Remove the 7 entries from the `int_fields` dict (lines 2434-2440).**

Delete these lines:
```python
		"min_minutes_monday": min_minutes_monday,
		"min_minutes_tuesday": min_minutes_tuesday,
		"min_minutes_wednesday": min_minutes_wednesday,
		"min_minutes_thursday": min_minutes_thursday,
		"min_minutes_friday": min_minutes_friday,
		"min_minutes_saturday": min_minutes_saturday,
		"min_minutes_sunday": min_minutes_sunday,
```

- [ ] **Step 7: Confirm no `min_minutes_` reference remains in mobile.py.**

Run: `grep -n "min_minutes_" vernon_project/api/mobile.py`
Expected: no output.

- [ ] **Step 8: Byte-compile.**

Run: `python3 -m py_compile vernon_project/api/mobile.py && echo OK`
Expected: `OK`

- [ ] **Step 9: Commit.**

```bash
git add vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json vernon_project/api/mobile.py
git commit -m "refactor(settings): drop global weekday minimums (moved to Brand)"
```

---

### Task 6: Migration — seed Brands from the old global weekday values

**Files:**
- Create: `vernon_project/patches/v1_0/brand_weekday_minimums.py`
- Modify: `vernon_project/patches.txt`

**Interfaces:**
- Consumes: Brand fields (Task 1), the still-readable orphaned Vernon Settings single-values.
- Produces: every existing Brand's 7 weekday fields carry the pre-move global values.

- [ ] **Step 1: Write the patch.**

Create `vernon_project/patches/v1_0/brand_weekday_minimums.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# One-time: move the per-weekday minimums off global Vernon Settings onto every Brand,
# so daily floors don't collapse when the global fields are removed. get_single_value
# still returns the orphaned tabSingles values after the fields leave the DocType meta.
import frappe

_FIELDS = [
	"min_minutes_monday", "min_minutes_tuesday", "min_minutes_wednesday",
	"min_minutes_thursday", "min_minutes_friday", "min_minutes_saturday",
	"min_minutes_sunday",
]


def execute():
	vals = {f: int(frappe.db.get_single_value("Vernon Settings", f) or 0) for f in _FIELDS}
	if not any(vals.values()):
		return  # globals never configured -> Brands keep their 0 defaults
	for name in frappe.get_all("Brand", pluck="name"):
		frappe.db.set_value("Brand", name, vals, update_modified=False)
```

- [ ] **Step 2: Register the patch.**

Append one line to `vernon_project/patches.txt`:
```
vernon_project.patches.v1_0.brand_weekday_minimums
```

- [ ] **Step 3: Byte-compile.**

Run: `python3 -m py_compile vernon_project/patches/v1_0/brand_weekday_minimums.py && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit.**

```bash
git add vernon_project/patches/v1_0/brand_weekday_minimums.py vernon_project/patches.txt
git commit -m "feat(patch): seed Brand weekday minimums from old global settings"
```

---

### Task 7: Brand forms + type + hooks gain the 7 weekday inputs (both frontends)

**Files:**
- Modify: `frontend/src/lib/types.ts:477-481` (`Brand` interface)
- Modify: `frontend/src/hooks/useData.ts:901-919` (`useCreateBrand`, `useUpdateBrand` payload types)
- Modify: `frontend-web/src/pages/BrandForm.tsx`
- Modify: `frontend/src/pages/BrandFormScreen.tsx`

**Interfaces:**
- Consumes: Brand fields (Task 1).
- Produces: `Brand` type carries 7 optional numeric weekday fields; both Brand forms load/edit/save them via the generic `resource` client.

- [ ] **Step 1: Extend the `Brand` interface (`frontend/src/lib/types.ts`).**

Replace:
```ts
export interface Brand {
  name: string
  brand_name: string
  company: string
}
```
with:
```ts
export interface Brand {
  name: string
  brand_name: string
  company: string
  min_minutes_monday?: number
  min_minutes_tuesday?: number
  min_minutes_wednesday?: number
  min_minutes_thursday?: number
  min_minutes_friday?: number
  min_minutes_saturday?: number
  min_minutes_sunday?: number
}

// Mon..Sun payload keys for a Brand's per-weekday minimums.
export const BRAND_WEEKDAY_KEYS = [
  'min_minutes_monday', 'min_minutes_tuesday', 'min_minutes_wednesday', 'min_minutes_thursday',
  'min_minutes_friday', 'min_minutes_saturday', 'min_minutes_sunday',
] as const
```

- [ ] **Step 2: Widen the mutation payload types (`frontend/src/hooks/useData.ts`).**

In `useCreateBrand`, change the `mutationFn` param type to allow the weekday keys:
```ts
    mutationFn: (payload: { brand_name: string; company: string } & Partial<Record<(typeof import('@/lib/types').BRAND_WEEKDAY_KEYS)[number], number>>) =>
```
That inline `typeof import(...)` is awkward; instead add `BRAND_WEEKDAY_KEYS` to the existing type import at the top of `useData.ts` and reference it. Concretely: ensure the top-of-file type import block that already pulls `Brand` also imports the const. Since `BRAND_WEEKDAY_KEYS` is a runtime `const` (not a type), import it as a value:
```ts
import { BRAND_WEEKDAY_KEYS } from '@/lib/types'
```
Then define near the top of `useData.ts`:
```ts
type BrandWeekdayPayload = Partial<Record<(typeof BRAND_WEEKDAY_KEYS)[number], number>>
```
and set the payload types:
```ts
    mutationFn: (payload: { brand_name: string; company: string } & BrandWeekdayPayload) =>
```
for `useCreateBrand`, and:
```ts
    mutationFn: ({ name, payload }: { name: string; payload: { company?: string } & BrandWeekdayPayload }) =>
```
for `useUpdateBrand` (note `company?` becomes optional).

- [ ] **Step 3: Add weekday inputs to `/w BrandForm.tsx`.**

Add to the import from `@/lib/types` (create one if absent) at the top:
```ts
import { BRAND_WEEKDAY_KEYS } from '@/lib/types'
```
Add a labels const near the top-level `field` const:
```ts
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
```
Add weekday state beside `form` (after line 45):
```ts
  const [minByWeekday, setMinByWeekday] = useState<string[]>(['0', '0', '0', '0', '0', '0', '0'])
```
Load it in the `useEffect` (inside the `if (isEdit && existing)` block, line 51):
```ts
      setMinByWeekday(BRAND_WEEKDAY_KEYS.map((k) => String(existing[k] ?? 0)))
```
Build the payload in `save` (replace lines 114-115):
```ts
    const n = (s: string) => (s === '' ? 0 : Number(s))
    const weekdays = Object.fromEntries(BRAND_WEEKDAY_KEYS.map((k, i) => [k, n(minByWeekday[i])]))
    if (isEdit) update.mutate({ name, payload: { company: form.company, ...weekdays } }, opts)
    else create.mutate({ brand_name: form.brand_name.trim(), company: form.company, ...weekdays }, opts)
```
Add a weekday grid inside the "Brand details" tile, right before the submit `<button type="submit"…>` (line 209):
```tsx
              <div>
                <p className="mb-1 text-xs font-semibold text-muted">Minimum minutes per weekday</p>
                <p className="mb-2 text-xs text-muted">0 = this brand does not work that day (no recurring todos land there).</p>
                <div className="grid grid-cols-2 gap-2">
                  {WEEKDAY_LABELS.map((lbl, i) => (
                    <label key={lbl} className="flex items-center gap-2">
                      <span className="w-9 shrink-0 text-xs font-medium text-muted">{lbl}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        className={field}
                        value={minByWeekday[i]}
                        onChange={(e) => {
                          setMinByWeekday((m) => m.map((v, k) => (k === i ? e.target.value : v)))
                          setDirty(true)
                        }}
                        placeholder="0"
                      />
                    </label>
                  ))}
                </div>
              </div>
```

- [ ] **Step 4: Add weekday inputs to `/m BrandFormScreen.tsx`.**

Add the type import at the top:
```ts
import { BRAND_WEEKDAY_KEYS } from '@/lib/types'
```
Add labels const beside the `field` const:
```ts
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
```
Add state after line 43:
```ts
  const [minByWeekday, setMinByWeekday] = useState<string[]>(['0', '0', '0', '0', '0', '0', '0'])
```
Load in the effect (inside `if (isEdit && existing)`, line 47):
```ts
      setMinByWeekday(BRAND_WEEKDAY_KEYS.map((k) => String(existing[k] ?? 0)))
```
Payload in `save` (replace lines 86-87):
```ts
    const n = (s: string) => (s === '' ? 0 : Number(s))
    const weekdays = Object.fromEntries(BRAND_WEEKDAY_KEYS.map((k, i) => [k, n(minByWeekday[i])]))
    if (isEdit) update.mutate({ name, payload: { company: form.company, ...weekdays } }, opts)
    else create.mutate({ brand_name: form.brand_name.trim(), company: form.company, ...weekdays }, opts)
```
Add a weekday grid right before the save `<button onClick={save}…>` (line 146):
```tsx
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
            Minimum minutes per weekday
          </label>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            0 = this brand does not work that day (no recurring todos land there).
          </p>
          <div className="grid grid-cols-2 gap-2">
            {WEEKDAY_LABELS.map((lbl, i) => (
              <label key={lbl} className="flex items-center gap-2">
                <span className="w-9 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{lbl}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className={field}
                  value={minByWeekday[i]}
                  onChange={(e) => setMinByWeekday((m) => m.map((v, k) => (k === i ? e.target.value : v)))}
                  placeholder="0"
                />
              </label>
            ))}
          </div>
        </div>
```

- [ ] **Step 5: Type-check both frontends.**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && cd ../frontend-web && npx tsc --noEmit && echo OK`
Expected: `OK` (no type errors). If `existing[k]` errors on index type, cast: `String((existing as Record<string, number>)[k] ?? 0)`.

- [ ] **Step 6: Commit.**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/types.ts frontend/src/hooks/useData.ts frontend-web/src/pages/BrandForm.tsx frontend/src/pages/BrandFormScreen.tsx
git commit -m "feat(brand-form): edit per-weekday minimums on both frontends"
```

---

### Task 8: Remove weekday UI from both Settings screens + AppSettings type

**Files:**
- Modify: `frontend/src/lib/types.ts:749-760` (`AppSettings`)
- Modify: `frontend/src/pages/SettingsScreen.tsx`
- Modify: `frontend-web/src/pages/Settings.tsx`

**Interfaces:**
- Consumes: backend removal (Task 5) — the 7 keys no longer exist in `get_app_settings`.

- [ ] **Step 1: Drop the 7 keys from the `AppSettings` interface (`frontend/src/lib/types.ts`).**

Delete these lines (753-759):
```ts
  min_minutes_monday: number
  min_minutes_tuesday: number
  min_minutes_wednesday: number
  min_minutes_thursday: number
  min_minutes_friday: number
  min_minutes_saturday: number
  min_minutes_sunday: number
```

- [ ] **Step 2: `/m SettingsScreen.tsx` — remove the weekday plumbing.**

- Delete the `WEEKDAY_MIN_KEYS` const + `WEEKDAY_LABELS` const (lines 14-19).
- Delete the state: `const [minByWeekday, setMinByWeekday] = useState<number[]>([0, 0, 0, 0, 0, 0, 0])` (line 30).
- Delete the load line: `setMinByWeekday(WEEKDAY_MIN_KEYS.map((k) => loaded[k]))` (line 48).
- Delete the 7 `min_minutes_*: minByWeekday[i]` keys from `doSave`'s payload (lines 81-87).
- Delete the entire "Minimum minutes per weekday" `<div className="flex flex-col gap-2">…</div>` block (lines 165-194).

- [ ] **Step 3: `/w Settings.tsx` — remove the weekday plumbing.**

- Delete the `WEEKDAY_MIN_KEYS` + `WEEKDAY_LABELS` consts (lines 14-19).
- Delete the state: `const [minByWeekday, setMinByWeekday] = useState<string[]>(['0', '0', '0', '0', '0', '0', '0'])` (line 29).
- Delete the load line: `setMinByWeekday(WEEKDAY_MIN_KEYS.map((k) => String(loaded[k])))` (line 49).
- Delete the 7 `min_minutes_*: n(minByWeekday[i])` keys from `doSave`'s payload (lines 94-100).
- Delete the entire `<BentoTile … title="Minimum Minutes / Weekday">…</BentoTile>` block (lines 239-263). Keep `n` (used by other fields).

- [ ] **Step 4: Confirm no `min_minutes`/`WEEKDAY_MIN`/`minByWeekday` reference remains.**

Run: `grep -rn "min_minutes\|WEEKDAY_MIN_KEYS\|minByWeekday" frontend/src/pages/SettingsScreen.tsx frontend-web/src/pages/Settings.tsx frontend/src/lib/types.ts`
Expected: no output.

- [ ] **Step 5: Type-check both frontends.**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && cd ../frontend-web && npx tsc --noEmit && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit.**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/types.ts frontend/src/pages/SettingsScreen.tsx frontend-web/src/pages/Settings.tsx
git commit -m "refactor(settings-ui): remove global weekday minimums (now per-Brand)"
```

---

### Task 9: Ship — migrate, build, restart, verify, What's New

**Files:**
- Modify: `docs/assets/data.js` (only if `gen_docs.py` moves it)
- Data: one `App Release` row on `project.vernon.id`

- [ ] **Step 1: Regenerate docs data (expected no-op).**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --stat docs/assets/data.js`
Expected: no diff (no doctype/endpoint/hook count changed). If it moved, `git add docs/assets/data.js` and commit `docs(data): regenerate`.

- [ ] **Step 2: Migrate (adds Brand fields, removes settings fields, runs the seed patch).**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Expected: completes; patch `brand_weekday_minimums` runs without error.

- [ ] **Step 3: Build both frontends.**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: both builds succeed; new hashed bundles under `vernon_project/public/frontend{,_web}/assets/`.

- [ ] **Step 4: Bump SW asset cache + purge Cloudflare (assets are CF-cached).**

Follow the project deploy memory: bump the service-worker `ASSET_CACHE` version (as in commit `2fb29dd`) and purge CF so the new bundle is served, avoiding a poisoned/blank app. Commit the built assets + SW bump.

- [ ] **Step 5: Restart the bench.**

Run: `sudo /usr/local/bin/tj-restart`
Expected: restart completes.

- [ ] **Step 6: Verify the resolver + recurrence on the live site.**

Run (single line, per the bench-console stdin gotcha):
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
from vernon_project.api.report import _resolve_min_minutes
b = frappe.get_all("Brand", pluck="name")[0]
frappe.db.set_value("Brand", b, {"min_minutes_monday": 480, "min_minutes_sunday": 0})
u = frappe.db.get_value("Attendance Profile", {"brand": b, "active": 1}, "user")
print("brand", b, "user", u)
print("mon", _resolve_min_minutes(u, "2026-07-20"), "sun", _resolve_min_minutes(u, "2026-07-19")) if u else print("no active profile for brand; spot-check skipped")
EOF
```
Expected: `mon 480 sun 0` for a brand user (or the skip note). Confirms Brand base + 0 = off.

- [ ] **Step 7: Insert the What's New (App Release) row.**

Write `/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/dcbba03d-a6cf-48eb-a029-58e274048923/scratchpad/release.json`:
```json
[{"version": "<semver bump from newest row>", "release_date": "<live date YYYY-MM-DD>", "title": "Jam kerja minimum kini per brand", "notes": "Setiap brand punya target menit minimum sendiri per hari (Senin–Minggu), diatur di form Brand (/m & /w).\nHari yang diisi 0 = brand libur hari itu — tugas berulang tidak lagi jatuh di hari libur.\nPengaturan menit minimum per hari dipindah dari Settings global ke masing-masing brand.", "platform": "Both"}]
```
(Set `version` by bumping the newest existing App Release row — minor bump, this is a feature. Set `release_date` to the actual go-live date.)

Insert (single self-contained line):
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/dcbba03d-a6cf-48eb-a029-58e274048923/scratchpad/release.json"))])
frappe.db.commit()
EOF
```

- [ ] **Step 8: Verify What's New reaches the endpoint.**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")[:1])
EOF`
Expected: the new row is first.

- [ ] **Step 9: Update the memory note.**

Update `vernon-per-weekday-minimum-minutes` memory: minimums are now **per-Brand** (authoritative, 0 = off), global Vernon Settings weekday fields removed, recurrence skips 0-minute days for the assignee via `advance_over_zero_days`.

---

## Self-Review

**Spec coverage:**
- Brand gets 7 weekday fields → Task 1. ✓
- Resolver reads Brand base, flat fallback → Task 2. ✓
- Remove global weekday fields (backend + frontend) → Tasks 5, 8. ✓
- Brand form editing (both frontends) → Task 7. ✓
- Skip 0-days in recurrence → Tasks 3 (pure helper) + 4 (wiring). ✓
- Migration safety (seed brands) → Task 6. ✓
- Tests (recurrence skip pure) → Task 3. `_daily_minimum` unchanged, existing tests still valid (no run on live per constraint). ✓
- gen_docs / What's New / deploy → Task 9. ✓

**Type consistency:** `advance_over_zero_days(start, step, min_for, until, bound)` — same signature in Task 3 (def + test) and Task 4 (call). `WEEKDAY_MIN_FIELDS` reused (Task 2). `BRAND_WEEKDAY_KEYS` defined in types.ts (Task 7 Step 1), consumed in hooks + both forms (Task 7 Steps 2-4). Field names `min_minutes_<weekday>` identical across doctype, resolver, patch, forms, payloads.

**Placeholder scan:** the only intentional fill-ins are the App Release `version`/`release_date` (Task 9 Step 7) — genuinely unknowable until go-live; instructions state exactly how to derive them.
