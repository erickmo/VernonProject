# Per-weekday Minimum Minutes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily minimum-minutes floor vary per user, per weekday (calendar/holiday-aware) and use it to drive auto-plan, the underperformed banner, and a new assignment-time overload warning.

**Architecture:** Add one optional field to `Shift Template`. A pure decision function `_daily_minimum(...)` plus a thin DB wrapper `_resolve_min_minutes(user, date)` resolve the floor per user-day, reusing the existing Shift Assignment / Shift Template / Attendance Holiday machinery already in `report.py`. The resolved floor replaces the flat global number in three consumers: the underperformed banner threshold, the auto-plan fill target (via a new `today_minimum` field on the shortfall payload — one shared hook covers both frontends), and a new `assignment_overload_check` endpoint surfaced as a shared non-blocking banner under the assignee picker.

**Tech Stack:** Frappe (Python), React + TanStack Query + Tailwind (two Vite frontends: `frontend/` = mobile `/m`, `frontend-web/` = web `/w`). Shared hooks/types/components live in `frontend/src` and are imported by both via the `@` alias.

## Global Constraints

- **Live site, code-first** (`project.vernon.id`, no separate test DB). Run ONLY the new pure test classes via `bench run-tests`; defer DB-integration tests. Frontend logic uses the repo's esbuild self-check pattern (`planDay.selfcheck.ts`), not a framework.
- **Global fallback unchanged:** `Vernon Settings.min_daily_estimated_minutes` (default 480) stays the fallback for users with no shift-derived minimum. No data migration; users without shifts keep current behavior.
- **Every dropdown = `SearchableSelect`/`MultiSelectSearch`** (existing convention) — this plan adds no new selects, so nothing to change there.
- **No native `alert/confirm`** — warnings render as inline banners.
- **Overload warning is non-blocking** — advisory only, never blocks save.
- **Restart after Python change:** `sudo /usr/local/bin/tj-restart`. **Schema change:** `bench --site project.vernon.id migrate`. **Frontend:** `npm run build` in each frontend dir + CF cache purge + SW asset-version bump (see Task 9).
- Backend method prefix in `frontend/src/lib/api.ts`: `R = 'vernon_project.api.report.'`.

---

## File Structure

**Backend** (`vernon_project/`):
- `vernon_project/doctype/shift_template/shift_template.json` — add `minimum_estimated_minutes` field.
- `api/report.py` — add `_daily_minimum` (pure), `_resolve_min_minutes` (DB wrapper), `_overload_verdict` (pure), `assignment_overload_check` (whitelisted); edit `my_previous_shift_shortfall`.
- `api/test_report.py` — add `TestDailyMinimum` + `TestOverloadVerdict` (pure, no fixtures); import the new symbols.

**Frontend** (shared in `frontend/src`, consumed by both frontends via `@`):
- `lib/types.ts` — add `today_minimum` to `PreviousShiftShortfall`; add `AssignmentOverload`.
- `lib/api.ts` — add `assignmentOverloadCheck` to `mobileApi`.
- `hooks/useData.ts` — add `useAssignmentOverload`.
- `hooks/usePlanDay.ts` — feed `today_minimum` into `autoFillPlan` (2 spots).
- `components/AssignmentOverloadBanner.tsx` — NEW shared banner.

**Frontend wiring (assignee pickers):**
- `frontend/src/components/CreateProjectItemSheet.tsx`, `frontend/src/pages/ProjectItemScreen.tsx` (mobile).
- `frontend-web/src/components/CreateProjectItemDialog.tsx`, `frontend-web/src/pages/ProjectItem.tsx` (web).

---

### Task 1: Add `minimum_estimated_minutes` to Shift Template

**Files:**
- Modify: `vernon_project/vernon_project/doctype/shift_template/shift_template.json:8-13`

**Interfaces:**
- Produces: DB column `minimum_estimated_minutes` (Int, nullable) on `tabShift Template`, read by `_resolve_min_minutes` in Task 2.

- [ ] **Step 1: Add the field to `field_order` and `fields`**

In `shift_template.json`, change `field_order` (line 8) to include the new field, and append the field definition to the `fields` array (after the `end_time` entry, line 12):

```json
 "field_order": ["shift_name", "start_time", "end_time", "minimum_estimated_minutes"],
 "fields": [
  {"fieldname": "shift_name", "fieldtype": "Data", "label": "Shift Name", "reqd": 1, "unique": 1, "in_list_view": 1},
  {"fieldname": "start_time", "fieldtype": "Time", "label": "Start Time", "reqd": 1, "in_list_view": 1},
  {"fieldname": "end_time", "fieldtype": "Time", "label": "End Time", "reqd": 1, "in_list_view": 1},
  {"fieldname": "minimum_estimated_minutes", "fieldtype": "Int", "label": "Minimum Estimated Minutes", "non_negative": 1, "description": "Daily floor for days on this shift. Blank/0 = use the shift length (end−start), then the global Min Daily Estimated Minutes."}
 ],
```

- [ ] **Step 2: Migrate to create the column**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Expected: completes without error (`Updating DocTypes for vernon_project` includes Shift Template).

- [ ] **Step 3: Verify the column exists**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id execute frappe.db.get_table_columns --kwargs "{'doctype': 'Shift Template'}"`
Expected: output list includes `'minimum_estimated_minutes'`.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/shift_template/shift_template.json
git commit -m "feat(shift): add Shift Template.minimum_estimated_minutes (per-weekday daily floor)"
```

---

### Task 2: Resolve the per-user-per-day minimum

**Files:**
- Modify: `vernon_project/api/report.py` (add after `_expected_minutes`, ~line 304)
- Test: `vernon_project/api/test_report.py` (add `TestDailyMinimum`; extend imports at line 6-15)

**Interfaces:**
- Produces:
  - `_daily_minimum(is_holiday: bool, has_assignments: bool, chosen: dict|None, global_min: int) -> int` (pure)
  - `_resolve_min_minutes(user: str, date: str) -> int` (DB wrapper) — used by Task 3 and Task 4.
- Consumes: `_holidays_by_user`, `_template_minutes`, `WEEKDAY_FIELDS`, `getdate` (all already in `report.py`).

- [ ] **Step 1: Write the failing test**

Add to `vernon_project/api/test_report.py` (append a new class near `TestResolveExpected`). Also add `_daily_minimum` to the import block at line 11:

```python
class TestDailyMinimum(unittest.TestCase):
	"""Pure daily-floor decision (_daily_minimum) — no DB."""

	def test_holiday_is_zero(self):
		self.assertEqual(_daily_minimum(True, True, {"min": 300, "length": 480}, 480), 0)

	def test_template_min_wins(self):
		self.assertEqual(_daily_minimum(False, True, {"min": 300, "length": 480}, 480), 300)

	def test_blank_min_falls_to_shift_length(self):
		self.assertEqual(_daily_minimum(False, True, {"min": 0, "length": 420}, 480), 420)

	def test_blank_min_and_zero_length_falls_to_global(self):
		self.assertEqual(_daily_minimum(False, True, {"min": 0, "length": 0}, 480), 480)

	def test_day_off_is_zero(self):
		self.assertEqual(_daily_minimum(False, True, None, 480), 0)

	def test_no_shift_setup_uses_global(self):
		self.assertEqual(_daily_minimum(False, False, None, 480), 480)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_report --test TestDailyMinimum`
Expected: FAIL — `ImportError: cannot import name '_daily_minimum'`.

- [ ] **Step 3: Write the implementation**

In `vernon_project/api/report.py`, insert after `_expected_minutes` (after line 303):

```python
def _daily_minimum(is_holiday, has_assignments, chosen, global_min):
	"""Pure: the daily floor in minutes for one user-day.

	is_holiday:      date is a holiday for the user  -> 0.
	chosen:          {'min': int, 'length': int} for the covering shift on this weekday,
	                 or None (day off / no covering assignment). min>0 wins; else length>0;
	                 else the global fallback.
	has_assignments: user has >=1 covering Shift Assignment. No assignments at all -> global
	                 (pre-shift behavior); assignments but this weekday off (chosen None) -> 0.
	"""
	global_min = int(global_min or 0)
	if is_holiday:
		return 0
	if chosen is not None:
		if chosen.get("min"):
			return int(chosen["min"])
		length = int(chosen.get("length") or 0)
		return length if length > 0 else global_min
	return 0 if has_assignments else global_min


def _resolve_min_minutes(user, date):
	"""Per-user daily minimum estimated minutes for one date — the auto-plan / underperformed
	floor. DB-gathering wrapper around _daily_minimum: holiday -> 0; shift day ->
	Shift Template.minimum_estimated_minutes or shift length or the global fallback; day off
	-> 0; no covering shift assignment -> global fallback (preserves pre-shift behavior)."""
	date = str(getdate(date))
	global_min = int(frappe.db.get_single_value("Vernon Settings", "min_daily_estimated_minutes") or 0)
	is_holiday = date in (_holidays_by_user([user], date, date).get(user) or set())
	assignments = frappe.get_all(
		"Shift Assignment",
		filters={"employee": user, "effective_from": ["<=", date]},
		or_filters=[["effective_to", ">=", date], ["effective_to", "is", "not set"]],
		fields=["shift_template", "effective_from", "effective_to", *WEEKDAY_FIELDS],
	)
	weekday_field = WEEKDAY_FIELDS[getdate(date).weekday()]
	chosen_assign = None
	for a in assignments:
		if a.get(weekday_field) and (
			chosen_assign is None
			or str(a["effective_from"]) >= str(chosen_assign["effective_from"])
		):
			chosen_assign = a
	chosen = None
	if chosen_assign:
		tmpl = frappe.db.get_value(
			"Shift Template", chosen_assign["shift_template"],
			["minimum_estimated_minutes", "start_time", "end_time"], as_dict=True,
		) or {}
		chosen = {
			"min": int(tmpl.get("minimum_estimated_minutes") or 0),
			"length": _template_minutes(tmpl.get("start_time"), tmpl.get("end_time")),
		}
	return _daily_minimum(is_holiday, bool(assignments), chosen, global_min)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_report --test TestDailyMinimum`
Expected: PASS (6 tests OK).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/report.py vernon_project/api/test_report.py
git commit -m "feat(report): resolve per-user-per-day minimum minutes (shift/holiday-aware)"
```

---

### Task 3: Drive the underperformed banner + auto-plan target from the resolved minimum

**Files:**
- Modify: `vernon_project/api/report.py:467-482` (`my_previous_shift_shortfall`)
- Modify: `frontend/src/lib/types.ts:702-708` (`PreviousShiftShortfall`)

**Interfaces:**
- Consumes: `_resolve_min_minutes` (Task 2), `_previous_shift_shortfall` (existing pure fn, unchanged), `nowdate`.
- Produces: `my_previous_shift_shortfall()` payload now carries `today_minimum` and a per-date `minimum`. Task 5 reads `today_minimum`.

- [ ] **Step 1: Update `my_previous_shift_shortfall`**

Replace the body of `my_previous_shift_shortfall` (lines 468-482) with:

```python
	"""Home-page danger banner: did the CURRENT user's most recent scheduled shift day
	(before today) fall below their resolved daily minimum in assigned minutes? Off/holiday
	days are skipped (no shift target), matching the Under-Occupied report. Also returns
	`today_minimum` (the resolved floor for TODAY) so the auto-plan can fill toward it.
	Self-serve — scoped to the caller only, so no System-Manager gate."""
	user = frappe.session.user
	if user in ("Guest", "Administrator"):
		verdict = _previous_shift_shortfall({}, {}, 0)
		verdict["today_minimum"] = 0
		return verdict
	end = add_days(getdate(nowdate()), -1)  # strictly before today
	start = add_days(end, -(PREV_SHIFT_LOOKBACK_DAYS - 1))
	names = [user]
	expected = _pivot(_expected_minutes(names, str(start), str(end))).get(user, {})
	assigned = _pivot(_assigned_minutes(names, str(start), str(end))).get(user, {})
	day = max(expected) if expected else None
	threshold = _resolve_min_minutes(user, day) if day else 0
	verdict = _previous_shift_shortfall(expected, assigned, threshold)
	verdict["today_minimum"] = _resolve_min_minutes(user, str(nowdate()))
	return verdict
```

(The old line `threshold = frappe.db.get_single_value(...)` at 474 is removed — the threshold is now the per-date resolved minimum.)

- [ ] **Step 2: Restart and smoke-check the payload shape**

Run: `sudo /usr/local/bin/tj-restart`
Then: `cd /home/frappe/frappe-bench && bench --site project.vernon.id execute vernon_project.api.report.my_previous_shift_shortfall`
Expected: a dict containing keys `under`, `date`, `assigned`, `minimum`, `expected`, `today_minimum` (values depend on the executing user; run as a normal user context returns numbers, Administrator returns `today_minimum: 0`).

- [ ] **Step 3: Add `today_minimum` to the frontend type**

In `frontend/src/lib/types.ts`, add the field to `PreviousShiftShortfall` (after line 707):

```typescript
export interface PreviousShiftShortfall {
  under: boolean
  date: string | null
  assigned: number
  minimum: number
  expected: number
  today_minimum: number
}
```

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors (the new field is optional to existing consumers, which only read `minimum`/`assigned`/`under`).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/report.py frontend/src/lib/types.ts
git commit -m "feat(report): per-date minimum drives underperformed banner + add today_minimum"
```

---

### Task 4: Assignment overload check endpoint

**Files:**
- Modify: `vernon_project/api/report.py` (add after `over_occupied`, ~line 440)
- Test: `vernon_project/api/test_report.py` (add `TestOverloadVerdict`; extend imports)

**Interfaces:**
- Produces:
  - `_overload_verdict(assigned, added, minimum, tolerance) -> dict` (pure)
  - `assignment_overload_check(user, date, added_minutes) -> dict` (whitelisted) — used by Task 6.
- Consumes: `_resolve_min_minutes` (Task 2), `_assigned_minutes`, `_pivot` (existing).

- [ ] **Step 1: Write the failing test**

Add to `vernon_project/api/test_report.py` (append a class; add `_overload_verdict` to imports at line 9):

```python
class TestOverloadVerdict(unittest.TestCase):
	"""Pure assignment-overload verdict (_overload_verdict) — no DB."""

	def test_over_when_above_minimum_plus_tolerance(self):
		out = _overload_verdict(assigned=400, added=200, minimum=480, tolerance=60)
		self.assertTrue(out["over"])  # 600 > 540
		self.assertEqual(out["assigned"], 400)
		self.assertEqual(out["added"], 200)
		self.assertEqual(out["minimum"], 480)
		self.assertEqual(out["tolerance"], 60)

	def test_not_over_within_tolerance(self):
		out = _overload_verdict(assigned=400, added=120, minimum=480, tolerance=60)
		self.assertFalse(out["over"])  # 520 <= 540

	def test_exactly_at_band_is_not_over(self):
		out = _overload_verdict(assigned=540, added=0, minimum=480, tolerance=60)
		self.assertFalse(out["over"])  # strict > ; 540 is not > 540

	def test_handles_none_inputs(self):
		out = _overload_verdict(None, None, None, None)
		self.assertFalse(out["over"])
		self.assertEqual(out["assigned"], 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_report --test TestOverloadVerdict`
Expected: FAIL — `ImportError: cannot import name '_overload_verdict'`.

- [ ] **Step 3: Write the implementation**

In `vernon_project/api/report.py`, insert after `over_occupied` (after line 440):

```python
def _overload_verdict(assigned, added, minimum, tolerance):
	"""Pure: would `added` minutes on top of `assigned` push a user's day above the daily
	minimum + tolerance? Strict >. Returns the advisory dict for the assignee picker."""
	assigned, added = int(assigned or 0), int(added or 0)
	minimum, tolerance = int(minimum or 0), int(tolerance or 0)
	return {
		"over": (assigned + added) > (minimum + tolerance),
		"assigned": assigned,
		"added": added,
		"minimum": minimum,
		"tolerance": tolerance,
	}


@frappe.whitelist()
def assignment_overload_check(user, date, added_minutes):
	"""Advisory for the assignee picker: does assigning `added_minutes` of work to `user` on
	`date` push their day total above the daily minimum + tolerance? Non-blocking. `assigned`
	= the user's already-allocated minutes that day (same source as the Over-Occupied report).
	ponytail: on self-reassign the todo's own virtual-default allocation is already counted in
	`assigned`, so the estimate can double-count — acceptable for a soft warning; the UI only
	shows it when the assignee actually changes. Session-authed (whitelist); returns aggregate
	minutes only, no todo content."""
	user = frappe.utils.cstr(user)
	date = str(getdate(date))
	added = frappe.utils.cint(added_minutes)
	minimum = _resolve_min_minutes(user, date)
	tolerance = int(frappe.db.get_single_value("Vernon Settings", "under_occupied_tolerance_minutes") or 0)
	assigned = _pivot(_assigned_minutes([user], date, date)).get(user, {}).get(date, 0)
	verdict = _overload_verdict(assigned, added, minimum, tolerance)
	verdict.update({"user": user, "date": date})
	return verdict
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_report --test TestOverloadVerdict`
Expected: PASS (4 tests OK).

- [ ] **Step 5: Restart and smoke-check the endpoint**

Run: `sudo /usr/local/bin/tj-restart`
Then: `cd /home/frappe/frappe-bench && bench --site project.vernon.id execute vernon_project.api.report.assignment_overload_check --kwargs "{'user': 'mo@vernon.id', 'date': '2026-07-13', 'added_minutes': 120}"`
Expected: dict with keys `over, assigned, added, minimum, tolerance, user, date`; `added` = 120.

- [ ] **Step 6: Commit**

```bash
git add vernon_project/api/report.py vernon_project/api/test_report.py
git commit -m "feat(report): add assignment_overload_check advisory endpoint"
```

---

### Task 5: Auto-plan fills toward today's resolved minimum

**Files:**
- Modify: `frontend/src/hooks/usePlanDay.ts:75` and `:106`

**Interfaces:**
- Consumes: `today_minimum` from `PreviousShiftShortfall` (Task 3). Shared hook — one change covers mobile `/m` and web `/w`.

- [ ] **Step 1: Point the silent auto-plan at `today_minimum`**

In `frontend/src/hooks/usePlanDay.ts`, change line 75:

```typescript
  const min = shortfall.data?.today_minimum ?? 0
```

- [ ] **Step 2: Point the one-click auto-plan button at `today_minimum`**

In the same file, change line 106 (inside `useAutoFillPlan`'s `run`):

```typescript
    const min = shortfall.data?.today_minimum ?? 0
```

- [ ] **Step 3: Run the plan-day self-check (logic unchanged, must still pass)**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx esbuild src/lib/planDay.selfcheck.ts --bundle --platform=node --outfile=/tmp/planday-selfcheck.js && node /tmp/planday-selfcheck.js`
Expected: prints `planDay self-check OK` (auto-plan already treats `min <= 0` as base-only, which correctly handles a day off where `today_minimum` = 0).

- [ ] **Step 4: Typecheck both frontends**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && cd ../frontend-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/usePlanDay.ts
git commit -m "feat(plan): auto-plan fills toward today's resolved per-day minimum"
```

---

### Task 6: Overload API binding, hook, and shared banner component

**Files:**
- Modify: `frontend/src/lib/types.ts` (add `AssignmentOverload`)
- Modify: `frontend/src/lib/api.ts:329-331` (add `assignmentOverloadCheck` to `mobileApi`)
- Modify: `frontend/src/hooks/useData.ts:1265-1270` (add `useAssignmentOverload` near `usePreviousShiftShortfall`)
- Create: `frontend/src/components/AssignmentOverloadBanner.tsx`

**Interfaces:**
- Produces:
  - `AssignmentOverload` type
  - `mobileApi.assignmentOverloadCheck(user, date, added_minutes)`
  - `useAssignmentOverload(user, date, addedMinutes, enabled)`
  - `<AssignmentOverloadBanner user date minutes enabled? />` — used by Tasks 7 & 8.

- [ ] **Step 1: Add the `AssignmentOverload` type**

In `frontend/src/lib/types.ts`, add near `PreviousShiftShortfall`:

```typescript
// Advisory returned by assignment_overload_check: would this todo's estimate push the
// assignee's day above their daily minimum + tolerance? `over` drives the picker banner.
export interface AssignmentOverload {
  over: boolean
  assigned: number
  added: number
  minimum: number
  tolerance: number
  user: string
  date: string
}
```

- [ ] **Step 2: Add the API binding**

In `frontend/src/lib/api.ts`, add inside the `mobileApi` object, right after the `previousShiftShortfall` binding (line 331):

```typescript
  assignmentOverloadCheck: (user: string, date: string, added_minutes: number) =>
    api.get<import('./types').AssignmentOverload>(R + 'assignment_overload_check', { user, date, added_minutes }),
```

- [ ] **Step 3: Add the hook**

In `frontend/src/hooks/useData.ts`, add after `usePreviousShiftShortfall` (line 1270):

```typescript
export function useAssignmentOverload(user: string, date: string, addedMinutes: number, enabled: boolean) {
  return useQuery({
    queryKey: ['assignment-overload', user, date, addedMinutes],
    queryFn: () => mobileApi.assignmentOverloadCheck(user, date, addedMinutes),
    enabled: enabled && !!user && !!date && addedMinutes > 0,
    staleTime: 30_000,
  })
}
```

- [ ] **Step 4: Create the shared banner component**

Create `frontend/src/components/AssignmentOverloadBanner.tsx`:

```tsx
import { AlertTriangle } from 'lucide-react'
import { useAssignmentOverload } from '@/hooks/useData'
import { formatEstimate } from '@/lib/format'

// Non-blocking advisory under the assignee picker: warns when this todo's estimate would
// push the chosen assignee's day above their daily minimum + tolerance (assignment_overload_check).
// Renders nothing until it has a user, a date, and >0 minutes, and nothing when not over.
// Shared by both frontends (mobile /m + web /w) via the @ alias.
export function AssignmentOverloadBanner({
  user, date, minutes, enabled = true,
}: {
  user: string
  date: string
  minutes: number
  enabled?: boolean
}) {
  const { data } = useAssignmentOverload(user, date, minutes, enabled)
  if (!data?.over) return null
  return (
    <div className="mt-1 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Overloads this member on {data.date}: {formatEstimate(data.assigned + data.added)} of {formatEstimate(data.minimum)} target.
      </span>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors. (`formatEstimate` already exists in `@/lib/format`; it is imported the same way in `usePlanDay.ts`.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts frontend/src/components/AssignmentOverloadBanner.tsx
git commit -m "feat(assign): overload-check api binding, hook, and shared warning banner"
```

---

### Task 7: Wire the overload banner into the mobile assignee pickers

**Files:**
- Modify: `frontend/src/components/CreateProjectItemSheet.tsx:140` (after the Assigned-to `SearchableSelect`)
- Modify: `frontend/src/pages/ProjectItemScreen.tsx:234` (after the Assigned-to `SearchableSelect` div)

**Interfaces:**
- Consumes: `<AssignmentOverloadBanner>` (Task 6). Create form → always enabled; edit screen → enabled only when the assignee changed (avoids the self-reassign double-count noted in Task 4).

- [ ] **Step 1: Import the banner in the create sheet**

In `frontend/src/components/CreateProjectItemSheet.tsx`, add to the imports (after line 6):

```typescript
import { AssignmentOverloadBanner } from '@/components/AssignmentOverloadBanner'
```

- [ ] **Step 2: Render the banner under the assignee field (create sheet)**

In `CreateProjectItemSheet.tsx`, immediately after the closing `</label>` of the Assigned-to field (line 140), insert:

```tsx
          <AssignmentOverloadBanner user={assignedTo} date={deadline} minutes={Number(estimated) || 0} />
```

- [ ] **Step 3: Import the banner in the edit screen**

In `frontend/src/pages/ProjectItemScreen.tsx`, add to the imports (after line 49):

```typescript
import { AssignmentOverloadBanner } from '@/components/AssignmentOverloadBanner'
```

- [ ] **Step 4: Render the banner under the assignee picker (edit screen)**

In `ProjectItemScreen.tsx`, immediately after the assignee `</div>` (line 234), insert. It is enabled only when the assignee differs from the saved value, so editing an unrelated field doesn't fire a warning:

```tsx
      <AssignmentOverloadBanner
        user={assignee}
        date={deadline}
        minutes={estimated === '' ? 0 : Number(estimated)}
        enabled={assignee !== data.assigned_to}
      />
```

- [ ] **Step 5: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CreateProjectItemSheet.tsx frontend/src/pages/ProjectItemScreen.tsx
git commit -m "feat(assign,mobile): overload warning under the assignee picker"
```

---

### Task 8: Wire the overload banner into the web assignee pickers

**Files:**
- Modify: `frontend-web/src/components/CreateProjectItemDialog.tsx:172` (after the Assigned-to `SearchableSelect`)
- Modify: `frontend-web/src/pages/ProjectItem.tsx:~640` (after the Assigned-to `SearchableSelect`; state var is `assignee`, line 622; `deadline` line 625)

**Interfaces:**
- Consumes: `<AssignmentOverloadBanner>` (Task 6), imported via `@/components/AssignmentOverloadBanner` (the `@` alias resolves to `frontend/src` in the web build, same as `@/components/SearchableSelect`).

- [ ] **Step 1: Import the banner in the web create dialog**

In `frontend-web/src/components/CreateProjectItemDialog.tsx`, add near the existing `SearchableSelect` import (line 7):

```typescript
import { AssignmentOverloadBanner } from '@/components/AssignmentOverloadBanner'
```

- [ ] **Step 2: Render the banner under the assignee field (web create dialog)**

In `CreateProjectItemDialog.tsx`, immediately after the closing `</label>` of the Assigned-to field (the `SearchableSelect` at line 169-171), insert:

```tsx
          <AssignmentOverloadBanner user={assignedTo} date={deadline} minutes={Number(estimated) || 0} />
```

- [ ] **Step 3: Import the banner in the web edit page**

In `frontend-web/src/pages/ProjectItem.tsx`, add near the existing `SearchableSelect` import (line 60):

```typescript
import { AssignmentOverloadBanner } from '@/components/AssignmentOverloadBanner'
```

- [ ] **Step 4: Render the banner under the assignee picker (web edit page)**

In `ProjectItem.tsx`, locate the Assigned-to `SearchableSelect` (value `assignee`, `onChange={setAssignee}`, around line 640-660) and insert immediately after it. `estimated` on this page is a string state mirror of `data.estimated`; use the same numeric coercion the save path uses:

```tsx
        <AssignmentOverloadBanner
          user={assignee}
          date={deadline}
          minutes={estimated === '' ? 0 : Number(estimated)}
          enabled={assignee !== data.assigned_to}
        />
```

(If `ProjectItem.tsx`'s estimated state is named differently or is already a number, use `Number(estimated) || 0`. Confirm the local state name at the assignee block before inserting.)

- [ ] **Step 5: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/components/CreateProjectItemDialog.tsx frontend-web/src/pages/ProjectItem.tsx
git commit -m "feat(assign,web): overload warning under the assignee picker"
```

---

### Task 9: Build, deploy, and verify end-to-end

**Files:** none (build + deploy).

- [ ] **Step 1: Ensure schema + Python are live**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate && sudo /usr/local/bin/tj-restart`
Expected: migrate completes; restart returns success.

- [ ] **Step 2: Build both frontends**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build && cd ../frontend-web && npm run build`
Expected: both builds succeed; new hashed bundles appear under `vernon_project/public/frontend/assets` and `.../frontend_web/assets`.

- [ ] **Step 3: Bust the asset cache**

Bump the service-worker `ASSET_CACHE` version and purge Cloudflare for `project.vernon.id` per the project convention (avoids a poisoned/blank bundle):

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && bench --site project.vernon.id clear-website-cache
# Purge Cloudflare assets (token in ~/.cf_token, zone bd13d791fab46ac955b9b068edefc049) — see cloudflare-asset-cache convention.
```

- [ ] **Step 4: Verify the three behaviors as a real user**

Configure one test user with a Shift Template whose `minimum_estimated_minutes` differs from its length (e.g. 8h shift, 360-min floor), assigned Mon–Fri, then check:
1. **Auto-plan** — open `/m` Today as that user on a working day: auto-plan fills toward 360 (not the old flat 480); on a day-off/holiday it stays base-only.
2. **Underperformed banner** — a past shift day below 360 assigned shows the "daily minimum missed" banner reading `X of 360`.
3. **Assignment overload** — in a project, pick that user as assignee for a todo with a large estimate on a date they're already loaded: the amber "Overloads this member" banner appears under the picker; a small estimate shows nothing.

Use the `superpowers:verification-before-completion` skill to confirm each with evidence before claiming done.

- [ ] **Step 5: Final commit (if any build artifacts are tracked)**

```bash
git add -A vernon_project/public/frontend vernon_project/public/frontend_web
git commit -m "build: ship per-weekday minimum minutes bundles"
```

---

## Self-Review

**1. Spec coverage:**
- Per-weekday minimum via shift system → Task 1 (field) + Task 2 (resolver). ✓
- Calendar override (holiday / dated assignment) → reused in `_resolve_min_minutes` (holiday → 0; latest-effective assignment chosen). ✓
- Fallback chain field → shift length → global → `_daily_minimum`. ✓
- Auto-plan uses it → Task 3 (`today_minimum`) + Task 5. ✓
- Underperformed warning uses it → Task 3 (`my_previous_shift_shortfall` threshold). ✓
- Assignment overload warning (new) → Task 4 (endpoint) + Task 6 (banner) + Tasks 7–8 (wiring). ✓
- Explicitly skipped items (no per-date doctype, no blocking, no 7-field editor) — honored. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows the code. The one conditional instruction (Task 8 Step 4, "confirm the local estimated state name") is a guarded fallback, not a placeholder — the primary code is given.

**3. Type consistency:** `_daily_minimum` / `_resolve_min_minutes` / `_overload_verdict` / `assignment_overload_check` names match across tasks. `today_minimum` added to `PreviousShiftShortfall` (Task 3) and consumed in Task 5. `AssignmentOverload` fields (`over/assigned/added/minimum/tolerance/user/date`) match the endpoint's returned dict (Task 4). `AssignmentOverloadBanner` prop names (`user/date/minutes/enabled`) match Tasks 7–8 call sites.
