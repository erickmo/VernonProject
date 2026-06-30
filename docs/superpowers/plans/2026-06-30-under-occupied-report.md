# Under-Occupied Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Under-Occupied" report listing active users whose average daily assigned estimated time falls below the daily floor minus a tolerance margin.

**Architecture:** Backend endpoint `under_occupied` in `vernon_project/api/report.py` reuses the Daily Estimated Time report's helpers (`_active_users`, `_require_system_manager`, `_date_list`) plus a new extracted `_assigned_minutes` helper and a pure `_build_under_occupied` aggregator. A new global `Vernon Settings.under_occupied_tolerance_minutes` setting (surfaced in both settings UIs) supplies the margin. The report UI is a sibling of `DailyEstimatedTimePage` in the separate `/home/frappe/ui` web app.

**Tech Stack:** Frappe (Python) backend; React 18 + TS + `frappe-react-sdk` for both the `vernon_project` settings frontends and the `/home/frappe/ui` report frontend.

## Global Constraints

- Two repos: backend + settings UI in `/home/frappe/frappe-bench/apps/vernon_project`; the report UI in `/home/frappe/ui`.
- Site: `project.vernon.id`. Bench root: `/home/frappe/frappe-bench`.
- "Occupied enough" target = `Vernon Settings.min_daily_estimated_minutes` (default 480). Tolerance = new `under_occupied_tolerance_minutes` (default 60). `effective = max(0, threshold - tolerance)`.
- Inclusion rule: user listed iff `avg_daily < effective` (strict `<`). Deficit = Σ per-day `max(0, threshold - assigned_day)` (busy days do NOT cancel idle days). `under_days` counts days with assigned `< effective`. Sort: `deficit` desc, then `full_name` asc.
- "Assigned" series semantics = explicit `Project Todo Assigned Allocation` rows + virtual default (whole `estimated` on the todo `deadline`) for todos with no explicit rows, excluding `🚫 Cancelled`. Identical to the Daily report.
- Default report range = current week Mon–Fri (no holiday calendar exists; `ponytail:` documented).
- Commit **source only**, one task at a time (`git add` just that task's files). NO per-task `npm run build`. `npx tsc --noEmit` must be 0 before committing any TS task. The user (erickmo) commits in parallel — re-check HEAD before each task.
- Pre-existing: `test_report.py::TestBuildDailyMatrix` is stale (old `_build_daily_matrix` signature) and may fail; that is NOT introduced by this work and is out of scope. Only the new test classes must pass.

---

### Task 1: Add `under_occupied_tolerance_minutes` setting (doctype + seed patch)

**Files:**
- Modify: `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json`
- Create: `vernon_project/vernon_project/patches/v1_0/seed_under_occupied_tolerance.py`
- Modify: `vernon_project/vernon_project/patches.txt`

**Interfaces:**
- Produces: `Vernon Settings.under_occupied_tolerance_minutes` (Int, default 60), readable via `frappe.db.get_single_value("Vernon Settings", "under_occupied_tolerance_minutes")`.

- [ ] **Step 1: Add the field to the doctype JSON**

In `vernon_settings.json`, update `field_order` (line 6) to insert the new fieldname right after `min_daily_estimated_minutes`:

```json
 "field_order": ["max_estimated_minutes", "min_daily_estimated_minutes", "under_occupied_tolerance_minutes", "attendance_section", "attendance_enabled", "qr_validity_seconds", "attendance_grace_minutes", "late_penalty_per_minute", "early_leave_penalty_per_minute", "absence_penalty", "recognition_section", "recognition_points", "recognition_weekly_cap"],
```

And in the `"fields"` array, immediately after the `min_daily_estimated_minutes` object (closes at line 23), insert:

```json
  {
   "fieldname": "under_occupied_tolerance_minutes",
   "fieldtype": "Int",
   "label": "Under-Occupied Tolerance (minutes)",
   "non_negative": 1,
   "default": "60",
   "description": "A day counts as under-occupied when assigned minutes fall below (Min Daily Estimated Minutes − this tolerance). Used by the Under-Occupied report."
  },
```

- [ ] **Step 2: Create the seed patch**

Create `vernon_project/vernon_project/patches/v1_0/seed_under_occupied_tolerance.py`:

```python
import frappe


def execute():
	# Only seed when unset (None); leave any admin-chosen value, including 0, intact.
	if frappe.db.get_single_value("Vernon Settings", "under_occupied_tolerance_minutes") is None:
		frappe.db.set_single_value("Vernon Settings", "under_occupied_tolerance_minutes", 60)
```

- [ ] **Step 3: Register the patch**

Append one line to the end of `vernon_project/vernon_project/patches.txt`:

```
vernon_project.patches.v1_0.seed_under_occupied_tolerance
```

- [ ] **Step 4: Verify it loads (no automated test — doctype JSON)**

Run:
```bash
cd /home/frappe/frappe-bench && python -c "import json; d=json.load(open('apps/vernon_project/vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json')); assert 'under_occupied_tolerance_minutes' in d['field_order']; assert any(f['fieldname']=='under_occupied_tolerance_minutes' for f in d['fields']); print('ok')"
```
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json vernon_project/vernon_project/patches/v1_0/seed_under_occupied_tolerance.py vernon_project/vernon_project/patches.txt
git commit -m "feat(settings): add under_occupied_tolerance_minutes"
```

---

### Task 2: Expose the tolerance in the app-settings API

**Files:**
- Modify: `vernon_project/vernon_project/api/mobile.py:2065-2122` (`get_app_settings`, `save_app_settings`)

**Interfaces:**
- Consumes: `Vernon Settings.under_occupied_tolerance_minutes` (Task 1).
- Produces: `get_app_settings()` returns key `under_occupied_tolerance_minutes` (int); `save_app_settings(under_occupied_tolerance_minutes=...)` persists it.

- [ ] **Step 1: Add the key to `get_app_settings`**

In the return dict of `get_app_settings` (after the `max_estimated_minutes` line, ~2071), add:

```python
		"under_occupied_tolerance_minutes": int(g("under_occupied_tolerance_minutes") or 0),
```

- [ ] **Step 2: Add the param and persistence to `save_app_settings`**

Add the parameter to the signature (after `max_estimated_minutes=None,`):

```python
	under_occupied_tolerance_minutes=None,
```

And add it to the `int_fields` dict (alongside `max_estimated_minutes`):

```python
		"under_occupied_tolerance_minutes": under_occupied_tolerance_minutes,
```

- [ ] **Step 3: Verify (manual round-trip)**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'PY'
from vernon_project.api.mobile import get_app_settings
print("under_occupied_tolerance_minutes" in get_app_settings())
PY
```
Expected: `True`

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/api/mobile.py
git commit -m "feat(settings): expose under_occupied_tolerance_minutes in app settings API"
```

---

### Task 3: Backend report logic — helper extraction, builder, endpoint, tests

**Files:**
- Modify: `vernon_project/vernon_project/api/report.py`
- Modify: `vernon_project/vernon_project/api/test_report.py`

**Interfaces:**
- Consumes: `_active_users`, `_require_system_manager`, `_date_list`, `MAX_SPAN_DAYS` (existing in `report.py`); the two settings from Tasks 1–2.
- Produces:
  - `_assigned_minutes(names, from_date, to_date) -> list[{user, day, minutes}]`
  - `_build_under_occupied(active_users, assigned_rows, from_date, to_date, threshold, tolerance) -> dict`
  - `@frappe.whitelist() under_occupied(from_date, to_date) -> dict` with keys `threshold, tolerance, effective, from_date, to_date, day_count, rows[]`; each row = `{user, full_name, assigned_total, avg_daily, under_days, deficit}`.

- [ ] **Step 1: Write the failing tests**

Append to `vernon_project/vernon_project/api/test_report.py`. First extend the import line at the top:

```python
from vernon_project.api.report import (
	_date_list, _build_daily_matrix, daily_estimated_time, daily_estimated_time_access,
	_build_under_occupied, under_occupied,
)
```

Then add these two test classes at the end of the file:

```python
class TestBuildUnderOccupied(unittest.TestCase):
	def test_includes_under_and_excludes_occupied(self):
		users = [{"name": "idle@x.id", "full_name": "Idle"}, {"name": "busy@x.id", "full_name": "Busy"}]
		rows = [
			{"user": "idle@x.id", "day": "2026-06-22", "minutes": 60},
			{"user": "idle@x.id", "day": "2026-06-23", "minutes": 60},
			{"user": "busy@x.id", "day": "2026-06-22", "minutes": 480},
			{"user": "busy@x.id", "day": "2026-06-23", "minutes": 480},
		]
		out = _build_under_occupied(users, rows, "2026-06-22", "2026-06-23", 480, 60)
		# effective = 420. idle avg 60 < 420 -> in; busy avg 480 -> out.
		self.assertEqual([r["user"] for r in out["rows"]], ["idle@x.id"])

	def test_tolerance_boundary_is_strict(self):
		users = [{"name": "edge@x.id", "full_name": "Edge"}]
		# effective = 420; avg exactly 420 is NOT under.
		out = _build_under_occupied(users, [{"user": "edge@x.id", "day": "2026-06-22", "minutes": 420}],
			"2026-06-22", "2026-06-22", 480, 60)
		self.assertEqual(out["rows"], [])
		# avg 419 IS under.
		out = _build_under_occupied(users, [{"user": "edge@x.id", "day": "2026-06-22", "minutes": 419}],
			"2026-06-22", "2026-06-22", 480, 60)
		self.assertEqual(len(out["rows"]), 1)

	def test_deficit_and_under_days_busy_days_do_not_cancel(self):
		users = [{"name": "mix@x.id", "full_name": "Mix"}]
		rows = [
			{"user": "mix@x.id", "day": "2026-06-22", "minutes": 600},  # over the floor
			{"user": "mix@x.id", "day": "2026-06-24", "minutes": 120},  # 23rd is idle (0)
		]
		out = _build_under_occupied(users, rows, "2026-06-22", "2026-06-24", 480, 60)
		r = out["rows"][0]
		self.assertEqual(r["assigned_total"], 720)
		self.assertEqual(r["avg_daily"], 240)            # 720 / 3
		self.assertEqual(r["under_days"], 2)             # 23rd (0) and 24th (120) below effective 420
		self.assertEqual(r["deficit"], 840)              # 0 + 480 + 360; the busy 600 day adds 0, not -120

	def test_empty_roster(self):
		out = _build_under_occupied([], [], "2026-06-22", "2026-06-23", 480, 60)
		self.assertEqual(out["rows"], [])
		self.assertEqual(out["effective"], 420)
		self.assertEqual(out["day_count"], 2)

	def test_envelope_and_sort_by_deficit_desc(self):
		users = [{"name": "a@x.id", "full_name": "A"}, {"name": "b@x.id", "full_name": "B"}]
		rows = [
			{"user": "a@x.id", "day": "2026-06-22", "minutes": 0},    # deficit 480
			{"user": "b@x.id", "day": "2026-06-22", "minutes": 200},  # deficit 280
		]
		out = _build_under_occupied(users, rows, "2026-06-22", "2026-06-22", 480, 60)
		self.assertEqual(out["threshold"], 480)
		self.assertEqual(out["tolerance"], 60)
		self.assertEqual(out["effective"], 420)
		self.assertEqual([r["user"] for r in out["rows"]], ["a@x.id", "b@x.id"])


class TestUnderOccupiedEndpoint(unittest.TestCase):
	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("User", "uo_guest@example.com"):
			frappe.delete_doc("User", "uo_guest@example.com", force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_requires_system_manager(self):
		if not frappe.db.exists("User", "uo_guest@example.com"):
			frappe.get_doc({"doctype": "User", "email": "uo_guest@example.com",
				"first_name": "UO", "send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.set_user("uo_guest@example.com")
		with self.assertRaises(frappe.PermissionError):
			under_occupied("2026-06-22", "2026-06-26")

	def test_rejects_oversize_span(self):
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):
			under_occupied("2026-01-01", "2026-12-31")

	def test_admin_gets_contract_shape(self):
		frappe.set_user("Administrator")
		out = under_occupied("2026-06-22", "2026-06-26")
		for k in ("threshold", "tolerance", "effective", "day_count", "rows"):
			self.assertIn(k, out)
		self.assertIsInstance(out["rows"], list)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_report 2>&1 | tail -30
```
Expected: import-time error / failures for `_build_under_occupied` and `under_occupied` (names not defined yet). (`TestBuildDailyMatrix` failures are pre-existing and unrelated.)

- [ ] **Step 3: Extract `_assigned_minutes` and refactor `daily_estimated_time`**

In `report.py`, add this helper (place it just above `daily_estimated_time`, after `_active_users`):

```python
def _assigned_minutes(names, from_date, to_date):
	"""[{user, day, minutes}] of ASSIGNED estimated minutes for `names` in the
	inclusive range. Explicit Project Todo Assigned Allocation rows + a virtual
	default (whole `estimated` on the todo's deadline) for todos with no explicit
	rows. Excludes 🚫 Cancelled. Empty list when `names` is empty."""
	if not names:
		return []
	start, end = str(getdate(from_date)), str(getdate(to_date))
	explicit = frappe.db.sql(
		"""
		SELECT todo.assigned_to AS user, alloc.allocation_date AS day,
		       SUM(alloc.estimated_minutes) AS minutes, todo.name AS todo
		FROM `tabProject Todo Assigned Allocation` AS alloc
		JOIN `tabProject Todo` AS todo ON alloc.parent = todo.name
		WHERE todo.assigned_to IN %(users)s AND alloc.parenttype = 'Project Todo'
		  AND todo.status != '\U0001f6ab Cancelled'
		  AND alloc.allocation_date BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY todo.assigned_to, alloc.allocation_date, todo.name
		""",
		{"users": names, "from_date": start, "to_date": end}, as_dict=True,
	)
	todos_with_explicit = {r["todo"] for r in explicit}
	rows = [{"user": r["user"], "day": r["day"], "minutes": r["minutes"]} for r in explicit]
	defaults = frappe.db.sql(
		"""
		SELECT name AS todo, assigned_to AS user, deadline AS day, estimated AS minutes
		FROM `tabProject Todo`
		WHERE assigned_to IN %(users)s AND IFNULL(estimated, 0) > 0
		  AND status != '\U0001f6ab Cancelled'
		  AND deadline BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"users": names, "from_date": start, "to_date": end}, as_dict=True,
	)
	for r in defaults:
		if r["todo"] not in todos_with_explicit:
			rows.append({"user": r["user"], "day": r["day"], "minutes": r["minutes"]})
	return rows
```

Then in `daily_estimated_time`, replace the entire inline `assigned_rows` block (current lines ~137–169, from `assigned_rows = []` through the `for r in defaults:` loop) with a single line:

```python
	assigned_rows = _assigned_minutes(names, start, end)
```

(Leave the `planned_rows = rows` line and the final `return _build_daily_matrix(...)` unchanged.)

- [ ] **Step 4: Add `_build_under_occupied` and the `under_occupied` endpoint**

Append to `report.py`:

```python
def _build_under_occupied(active_users, assigned_rows, from_date, to_date, threshold, tolerance):
	"""Pure aggregation for the Under-Occupied report. `assigned_rows`:
	[{user, day, minutes}]. Returns only users whose AVERAGE daily assigned
	minutes fall below (threshold - tolerance), sorted by deficit desc."""
	dates = _date_list(from_date, to_date)
	threshold = int(threshold or 0)
	tolerance = int(tolerance or 0)
	effective = max(0, threshold - tolerance)
	day_count = len(dates)

	by_user = {}
	for r in assigned_rows:
		by_user.setdefault(r["user"], {})
		day = str(r["day"])
		by_user[r["user"]][day] = by_user[r["user"]].get(day, 0) + int(r["minutes"] or 0)

	out = []
	for u in active_users:
		per = by_user.get(u["name"], {})
		assigned_total = under_days = deficit = 0
		for d in dates:
			am = int(per.get(d, 0))
			assigned_total += am
			if am < effective:
				under_days += 1
			if threshold - am > 0:
				deficit += threshold - am
		avg_daily = round(assigned_total / day_count) if day_count else 0
		if avg_daily < effective:
			out.append({
				"user": u["name"], "full_name": u.get("full_name") or u["name"],
				"assigned_total": assigned_total, "avg_daily": avg_daily,
				"under_days": under_days, "deficit": deficit,
			})
	out.sort(key=lambda r: (-r["deficit"], r["full_name"]))
	return {
		"threshold": threshold, "tolerance": tolerance, "effective": effective,
		"from_date": str(getdate(from_date)), "to_date": str(getdate(to_date)),
		"day_count": day_count, "rows": out,
	}


@frappe.whitelist()
def under_occupied(from_date, to_date):
	"""Active users whose average daily assigned estimated minutes fall below
	(min_daily_estimated_minutes - under_occupied_tolerance_minutes) over the
	inclusive range. System-Manager only."""
	_require_system_manager()

	start = getdate(from_date)
	end = getdate(to_date)
	if end < start:
		frappe.throw("from_date must be on or before to_date.", frappe.ValidationError)
	if date_diff(end, start) > MAX_SPAN_DAYS:
		frappe.throw(f"Date range too large (max {MAX_SPAN_DAYS} days).", frappe.ValidationError)

	threshold = frappe.db.get_single_value("Vernon Settings", "min_daily_estimated_minutes") or 0
	tolerance = frappe.db.get_single_value("Vernon Settings", "under_occupied_tolerance_minutes") or 0

	users = _active_users()
	names = [u["name"] for u in users]
	assigned_rows = _assigned_minutes(names, start, end)
	return _build_under_occupied(users, assigned_rows, start, end, threshold, tolerance)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_report 2>&1 | tail -30
```
Expected: `TestBuildUnderOccupied` (5 tests) and `TestUnderOccupiedEndpoint` (3 tests) all PASS. (Any `TestBuildDailyMatrix` failures are the pre-existing stale ones — ignore.)

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/api/report.py vernon_project/api/test_report.py
git commit -m "feat(report): add Under-Occupied endpoint + extract _assigned_minutes helper"
```

---

### Task 4: Surface the tolerance in both settings UIs

**Files:**
- Modify: `frontend/src/lib/types.ts:576-584` (`AppSettings`)
- Modify: `frontend/src/pages/SettingsScreen.tsx` (mobile)
- Modify: `frontend-web/src/pages/Settings.tsx` (web)

**Interfaces:**
- Consumes: `under_occupied_tolerance_minutes` from `get_app_settings`/`save_app_settings` (Task 2).

- [ ] **Step 1: Add the field to the `AppSettings` type**

In `frontend/src/lib/types.ts`, inside `interface AppSettings`, add after `max_estimated_minutes`:

```ts
  under_occupied_tolerance_minutes: number
```

- [ ] **Step 2: Wire it into the mobile `SettingsScreen.tsx`**

Add state (after the `maxEstimatedMinutes` state, ~line 19):

```tsx
  const [toleranceMinutes, setToleranceMinutes] = useState<number>(0)
```

Load it in the `useEffect` (after `setMaxEstimatedMinutes(...)`, ~line 29):

```tsx
    setToleranceMinutes(loaded.under_occupied_tolerance_minutes)
```

Save it in `doSave`'s mutate payload (after `max_estimated_minutes: maxEstimatedMinutes,`):

```tsx
        under_occupied_tolerance_minutes: toleranceMinutes,
```

Add the input block right after the "Max estimated minutes" block (after its closing `</div>` ~line 97):

```tsx
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Under-occupied tolerance (min)
          </label>
          {num(toleranceMinutes, setToleranceMinutes, '60')}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Flag a day under (min daily − this) in the Under-Occupied report.
          </p>
        </div>
```

- [ ] **Step 3: Wire it into the web `Settings.tsx`**

Add state (after `maxEstimatedMinutes`, ~line 18):

```tsx
  const [toleranceMinutes, setToleranceMinutes] = useState<string>('0')
```

Load it in the `useEffect` (after `setMaxEstimatedMinutes(...)`, ~line 28):

```tsx
    setToleranceMinutes(String(loaded.under_occupied_tolerance_minutes))
```

Save it in `doSave`'s mutate payload (after `max_estimated_minutes: n(maxEstimatedMinutes),`):

```tsx
        under_occupied_tolerance_minutes: n(toleranceMinutes),
```

Add a second `Field` inside the existing "Max Estimated Minutes" `BentoTile` (after the first `Field`'s closing tag, ~line 111), and rename that tile's `title` to `"Estimate Limits"`:

```tsx
            <Field label="Under-occupied tolerance (min)">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className={field}
                  value={toleranceMinutes}
                  onChange={(e) => setToleranceMinutes(e.target.value)}
                  placeholder="60"
                />
              )}
            </Field>
```

- [ ] **Step 4: Typecheck both frontends**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && cd ../frontend-web && npx tsc --noEmit && echo TSC_OK
```
Expected: `TSC_OK` (no errors).

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/types.ts frontend/src/pages/SettingsScreen.tsx frontend-web/src/pages/Settings.tsx
git commit -m "feat(settings-ui): edit under-occupied tolerance in mobile + web settings"
```

---

### Task 5: Report data layer — types + hook (`/home/frappe/ui`)

**Files:**
- Modify: `src/features/reports/types.ts`
- Create: `src/features/reports/useUnderOccupied.ts`

**Interfaces:**
- Consumes: the `under_occupied` endpoint contract (Task 3).
- Produces: `UnderOccupiedRow`, `UnderOccupiedResponse` types; `useUnderOccupied(fromDate, toDate)` hook returning `{ data: UnderOccupiedResponse | undefined; isLoading; error }`.

- [ ] **Step 1: Append the types**

Add to `src/features/reports/types.ts`:

```ts
export interface UnderOccupiedRow {
  user: string;
  full_name: string;
  assigned_total: number;
  avg_daily: number;
  under_days: number;
  deficit: number;
}

export interface UnderOccupiedResponse {
  threshold: number;
  tolerance: number;
  effective: number;
  from_date: string;
  to_date: string;
  day_count: number;
  rows: UnderOccupiedRow[];
}
```

- [ ] **Step 2: Create the hook**

Create `src/features/reports/useUnderOccupied.ts`:

```ts
import { useFrappeGetCall } from 'frappe-react-sdk';
import type { UnderOccupiedResponse } from './types';

interface Envelope {
  message: UnderOccupiedResponse;
}

export function useUnderOccupied(
  fromDate: string,
  toDate: string,
): { data: UnderOccupiedResponse | undefined; isLoading: boolean; error: unknown } {
  const { data, isLoading, error } = useFrappeGetCall<Envelope>(
    'vernon_project.api.report.under_occupied',
    { from_date: fromDate, to_date: toDate },
  );
  return { data: data?.message, isLoading, error };
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd /home/frappe/ui && npx tsc --noEmit && echo TSC_OK
```
Expected: `TSC_OK`.

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/ui
git add src/features/reports/types.ts src/features/reports/useUnderOccupied.ts
git commit -m "feat(reports): add under-occupied types + data hook"
```

---

### Task 6: Report page component (`/home/frappe/ui`)

**Files:**
- Create: `src/features/reports/UnderOccupiedPage.tsx`

**Interfaces:**
- Consumes: `useUnderOccupied` (Task 5), `UnderOccupiedRow` (Task 5), `useCanViewDailyEstimatedTime` (existing — same System-Manager gate), shared `PageHeader`/`MetricCard`/`DataTable`/`NoAccessState`/`formatDuration`.
- Produces: `UnderOccupiedPage` (default-less named export) consumed by the router (Task 7).

- [ ] **Step 1: Create the page**

Create `src/features/reports/UnderOccupiedPage.tsx`:

```tsx
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { NoAccessState } from '@/components/states/NoAccessState';
import { formatDuration } from '@/lib/format/duration';
import { useUnderOccupied } from './useUnderOccupied';
import type { UnderOccupiedRow } from './types';
import { useCanViewDailyEstimatedTime } from './useCanViewDailyEstimatedTime';

/** Monday–Friday of the current week, as ['YYYY-MM-DD','YYYY-MM-DD'].
 *  ponytail: working-day default = no holiday calendar; widen the range manually. */
function defaultWorkWeek(): { from: string; to: string } {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const iso = (d: Date) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD, local
  return { from: iso(monday), to: iso(friday) };
}

const columns: ColumnDef<UnderOccupiedRow>[] = [
  { key: 'full_name', header: 'User', className: 'font-medium text-foreground' },
  { key: 'avg_daily', header: 'Avg Daily', align: 'right', render: (r) => formatDuration(r.avg_daily) },
  { key: 'under_days', header: 'Under-days', align: 'right', render: (r) => String(r.under_days) },
  { key: 'deficit', header: 'Deficit', align: 'right', render: (r) => formatDuration(r.deficit) },
];

export function UnderOccupiedPage(): JSX.Element {
  const { canView, isLoading: accessLoading } = useCanViewDailyEstimatedTime();
  const [range, setRange] = useState(defaultWorkWeek);
  const { data, isLoading, error } = useUnderOccupied(range.from, range.to);

  if (!canView && !accessLoading) return <NoAccessState />;
  if (
    error &&
    typeof error === 'object' &&
    'httpStatus' in error &&
    (error as { httpStatus?: number }).httpStatus === 403
  ) {
    return <NoAccessState />;
  }

  const rows = data?.rows ?? [];
  const target = data?.threshold ?? 0;
  const totalDeficit = rows.reduce((n, r) => n + r.deficit, 0);
  const avgDaily = rows.length
    ? Math.round(rows.reduce((n, r) => n + r.avg_daily, 0) / rows.length)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Under-Occupied"
        actions={
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
              aria-label="From date"
            />
            <span className="text-muted-foreground">–</span>
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
              aria-label="To date"
            />
          </div>
        }
      />

      <p className="text-xs text-muted-foreground -mt-2">
        Average daily assigned below target ({target === 0 ? '—' : formatDuration(target)} − tolerance). Pick a working-day range.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Under-Occupied Users" value={rows.length} format="number" compact={false} isLoading={isLoading} error={error} />
        <MetricCard label="Total Free Capacity (min)" value={totalDeficit} format="number" compact={false} isLoading={isLoading} error={error} />
        <MetricCard label="Avg Daily (min)" value={avgDaily} format="number" compact={false} isLoading={isLoading} error={error} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        error={error}
        emptyMessage="Everyone is occupied enough."
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
cd /home/frappe/ui && npx tsc --noEmit && echo TSC_OK
```
Expected: `TSC_OK`.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/ui
git add src/features/reports/UnderOccupiedPage.tsx
git commit -m "feat(reports): add Under-Occupied report page"
```

---

### Task 7: Register the report (nav + route) (`/home/frappe/ui`)

**Files:**
- Modify: `src/features/reports/registry.ts`
- Modify: `src/app/router.tsx:23,95-105`

**Interfaces:**
- Consumes: `UnderOccupiedPage` (Task 6).
- Produces: nav entry (Sidebar auto-maps `reportsModules`) + `/reports/under-occupied` route.

- [ ] **Step 1: Add the registry module**

In `src/features/reports/registry.ts`, update the icon import and add the module:

```ts
import { Clock, UserMinus, type LucideIcon } from 'lucide-react';
```

```ts
export const UNDER_OCCUPIED: ReportModule = {
  key: 'under-occupied',
  label: 'Under-Occupied',
  to: '/reports/under-occupied',
  icon: UserMinus,
};

/** Single source of truth for the REPORTS nav group and routes. */
export const reportsModules: ReportModule[] = [DAILY_ESTIMATED_TIME, UNDER_OCCUPIED];
```

- [ ] **Step 2: Add the route**

In `src/app/router.tsx`, add the import after line 23:

```tsx
import { UnderOccupiedPage } from '../features/reports/UnderOccupiedPage';
```

And add the child route inside `reportsRoutes()` (after the `daily-estimated-time` line, ~101):

```tsx
        { path: 'under-occupied', element: <UnderOccupiedPage /> },
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd /home/frappe/ui && npx tsc --noEmit && echo TSC_OK
```
Expected: `TSC_OK`.

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/ui
git add src/features/reports/registry.ts src/app/router.tsx
git commit -m "feat(reports): register Under-Occupied nav entry + route"
```

---

### Task 8: Deploy + manual smoke (user-run)

**Files:** none (build/migrate/verify only).

> Per repo conventions, `bench migrate` and `npm run build` are the user's to run (local single-site deploy). Do NOT run them automatically; present these steps to the user.

- [ ] **Step 1: Apply the new setting on the live site**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
```
Expected: migrate completes; `seed_under_occupied_tolerance` runs once.

- [ ] **Step 2: Build both frontends**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && npm run build   # settings UI (mobile + web)
cd /home/frappe/ui && npm run build                                 # the report
```

- [ ] **Step 3: Manual smoke**

- Open Settings (web or mobile) as a manager → "Under-occupied tolerance (min)" field present, defaults to 60, saves and reloads.
- Open Reports → "Under-Occupied" appears in the nav (System Manager only).
- The page lists users whose avg daily assigned over the Mon–Fri range is below `min_daily − tolerance`, sorted by deficit; changing the date range refetches; a non-manager sees the No-Access state.

## Self-Review

- **Spec coverage:** threshold/floor reuse (Task 3 endpoint reads `min_daily_estimated_minutes`); tolerance as new global setting (Tasks 1, 2, 4); per-person summary shape with avg/deficit/under-days (Task 3 `_build_under_occupied`, Task 6 table); date-range default Mon–Fri (Task 6 `defaultWorkWeek`); DRY assigned-series helper (Task 3 `_assigned_minutes`); System-Manager gate reuse (Tasks 3, 6); registry + route wiring (Task 7); tests (Task 3). All spec sections mapped.
- **Placeholders:** none — every step carries real code/commands.
- **Type consistency:** `under_occupied` response keys (`threshold, tolerance, effective, from_date, to_date, day_count, rows`) and row keys (`user, full_name, assigned_total, avg_daily, under_days, deficit`) match between Task 3 (Python), Task 5 (`UnderOccupiedResponse`/`UnderOccupiedRow`), and Task 6 (table). `useUnderOccupied` signature matches its use in Task 6. `_assigned_minutes`/`_build_under_occupied` names consistent across Task 3 and tests.
- **Out-of-scope guard:** stale `TestBuildDailyMatrix` untouched; no holiday calendar; floor stays doctype-form-only.
