# Intern Allocation Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an HR-facing report at `/reports/intern-allocation` on both frontends showing every intern × day of assigned minutes plus the signals that reveal whether their project leader is managing them.

**Architecture:** Two new whitelisted endpoints in the existing `vernon_project/api/report.py`, built on the already-tested pure helpers there (`_build_daily_matrix`, `_assigned_minutes`, `_validated_range`, `_projects_i_run`). All new logic lands in one pure, DB-free builder (`_build_intern_matrix`) so it is unit-testable without a site. The UI is two screens (mobile Soft-Pop cards, web bento/table) over one shared api client + hook + help-copy module in `frontend/src`.

**Tech Stack:** Frappe (Python 3, MariaDB), React 18 + TypeScript + Tailwind + TanStack Query, Vite. Tests: `unittest` run by `bench run-tests`.

**Spec:** `docs/superpowers/specs/2026-08-23-intern-allocation-matrix-design.md`

## Global Constraints

- **Both frontends, always.** `frontend/` = mobile `/m`, `frontend-web/` = web `/w`. A screen in one is not done until the equivalent exists in the other (CLAUDE.md).
- **Shared logic lives in `frontend/src`** (imported as `@` from web). Only presentation is per-frontend.
- **Every dropdown** uses `SearchableSelect` / `MultiSelectSearch`; **every date field** uses the shared `DatePicker`. Zero native `<select>`, zero native date inputs.
- **No `alert()` / `confirm()` / `prompt()`.**
- Python style in this repo: **tabs**, not spaces, in `api/report.py` and its tests.
- Status constants already exist in `report.py`: `STATUS_PLANNED`, `STATUS_COMPLETED`, `STATUS_CANCELLED`, `STATUS_CHECKED`. The `🟠 Done` status has no constant yet — add `STATUS_DONE = "\U0001f7e0 Done"` in Task 1.
- The site is LIVE (`project.vernon.id`) and there is no test DB. Write code + tests per task; run `bench run-tests` ONCE at the end (Task 7).
- After endpoints land: `python3 scripts/gen_docs.py` and commit the regenerated `docs/assets/data.js`.
- After the bundles ship: insert an `App Release` row (What's New), Bahasa, `platform: "Both"`.

---

### Task 1: Pure signal builder

**Files:**
- Modify: `vernon_project/api/report.py` (add constants + `_weekday_dates` + `_build_intern_matrix` after `_build_daily_matrix`, ~line 74)
- Test: `vernon_project/api/test_intern_allocation.py` (create)

**Interfaces:**
- Consumes: `_build_daily_matrix(active_users, assigned_rows, planned_rows, from_date, to_date, threshold)` — already exists, returns `{threshold, from_date, to_date, dates, rows:[{user, full_name, per_day_assigned, per_day_planned, assigned_total, planned_total, flagged_dates}]}`.
- Produces:
  - `STATUS_DONE: str`
  - `STALE_ASSIGNMENT_DAYS: int = 7`, `REVIEW_WAIT_DAYS: int = 3`
  - `_weekday_dates(dates: list[str]) -> list[str]`
  - `_build_intern_matrix(matrix: dict, interns: list[dict], todo_rows: list[dict], note_rows: list[dict], scope: str) -> dict`
    - `interns`: `[{"name", "full_name", "sources": ["member_type"|"profile"]}]`
    - `todo_rows`: `[{"user","project","project_name","leader","leader_name","status","deadline","done_on","review_since","minutes","in_range"}]` — `done_on`/`review_since`/`deadline` are `str|None` dates, `in_range` a bool the caller sets.
    - `note_rows`: `[{"user","note_date"}]`
    - returns the endpoint payload documented in the spec.

- [ ] **Step 1: Write the failing tests**

```python
# vernon_project/api/test_intern_allocation.py
import unittest

from vernon_project.api.report import (
	STATUS_CHECKED, STATUS_COMPLETED, STATUS_DONE, STATUS_PLANNED,
	_build_daily_matrix, _build_intern_matrix, _weekday_dates,
)

# 2026-08-17 is a Monday, so 22 = Saturday and 23 = Sunday.
WEEK = ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"]


def _matrix(users, assigned, threshold=0):
	return _build_daily_matrix(users, assigned, [], WEEK[0], WEEK[-1], threshold)


def _todo(user="budi@x.id", **kw):
	row = {
		"user": user, "project": "PROJ-1", "project_name": "Website",
		"leader": "sinta@x.id", "leader_name": "Sinta", "status": STATUS_PLANNED,
		"deadline": None, "done_on": None, "review_since": None,
		"minutes": 60, "in_range": True,
	}
	row.update(kw)
	return row


class TestWeekdayDates(unittest.TestCase):
	def test_drops_saturday_and_sunday(self):
		self.assertEqual(_weekday_dates(WEEK), WEEK[:5])

	def test_empty(self):
		self.assertEqual(_weekday_dates([]), [])


class TestBuildInternMatrix(unittest.TestCase):
	def _run(self, assigned=(), todos=(), notes=(), sources=("member_type",), scope="all"):
		users = [{"name": "budi@x.id", "full_name": "Budi"}]
		interns = [{"name": "budi@x.id", "full_name": "Budi", "sources": list(sources)}]
		out = _build_intern_matrix(_matrix(users, list(assigned)), interns, list(todos), list(notes), scope)
		return out, out["rows"][0]

	def test_no_work_at_all_is_idle(self):
		out, row = self._run()
		self.assertEqual(row["zero_days"], 5)          # 5 weekdays, none worked
		self.assertIsNone(row["last_assigned_on"])
		self.assertEqual(row["stale_days"], len(WEEK))  # never assigned → whole range
		self.assertTrue(row["attention"])
		self.assertIn("idle", row["reasons"])
		self.assertEqual(out["totals"], {"interns": 1, "attention": 1})
		self.assertEqual(out["scope"], "all")

	def test_weekend_only_work_still_counts_as_idle(self):
		_, row = self._run(assigned=[{"user": "budi@x.id", "day": "2026-08-22", "minutes": 300}])
		self.assertEqual(row["zero_days"], 5)
		self.assertIn("idle", row["reasons"])
		self.assertEqual(row["last_assigned_on"], "2026-08-22")

	def test_last_assigned_and_stale_days(self):
		_, row = self._run(assigned=[{"user": "budi@x.id", "day": "2026-08-19", "minutes": 120}])
		self.assertEqual(row["last_assigned_on"], "2026-08-19")
		self.assertEqual(row["stale_days"], 4)   # to_date 08-23 minus 08-19
		self.assertEqual(row["zero_days"], 4)
		self.assertNotIn("stale", row["reasons"])  # 4 < STALE_ASSIGNMENT_DAYS

	def test_full_week_of_work_needs_no_attention(self):
		assigned = [{"user": "budi@x.id", "day": d, "minutes": 180} for d in WEEK[:5]]
		_, row = self._run(assigned=assigned)
		self.assertEqual(row["zero_days"], 0)
		self.assertFalse(row["attention"])
		self.assertEqual(row["reasons"], [])

	def test_awaiting_review_counts_and_oldest_wait(self):
		todos = [
			_todo(status=STATUS_DONE, review_since="2026-08-20"),
			_todo(status=STATUS_CHECKED, review_since="2026-08-14"),
			_todo(status=STATUS_COMPLETED, done_on="2026-08-18"),
		]
		assigned = [{"user": "budi@x.id", "day": d, "minutes": 180} for d in WEEK[:5]]
		_, row = self._run(assigned=assigned, todos=todos)
		self.assertEqual(row["awaiting_review"], 2)
		self.assertEqual(row["oldest_wait_days"], 9)   # 08-23 minus 08-14
		self.assertTrue(row["attention"])
		self.assertIn("waiting", row["reasons"])

	def test_wait_boundary(self):
		assigned = [{"user": "budi@x.id", "day": d, "minutes": 180} for d in WEEK[:5]]
		_, two = self._run(assigned=assigned, todos=[_todo(status=STATUS_DONE, review_since="2026-08-21")])
		self.assertEqual(two["oldest_wait_days"], 2)
		self.assertNotIn("waiting", two["reasons"])
		_, three = self._run(assigned=assigned, todos=[_todo(status=STATUS_DONE, review_since="2026-08-20")])
		self.assertEqual(three["oldest_wait_days"], 3)
		self.assertIn("waiting", three["reasons"])

	def test_done_and_late_counts(self):
		todos = [
			_todo(status=STATUS_COMPLETED, done_on="2026-08-19", deadline="2026-08-20"),  # early
			_todo(status=STATUS_COMPLETED, done_on="2026-08-21", deadline="2026-08-19"),  # late
			_todo(status=STATUS_PLANNED, deadline="2026-08-21"),                          # not done
		]
		_, row = self._run(todos=todos)
		self.assertEqual(row["assigned_count"], 3)
		self.assertEqual(row["done"], 2)
		self.assertEqual(row["late"], 1)

	def test_out_of_range_waiting_todo_does_not_inflate_counts(self):
		# A todo delivered long before the window and still unreviewed: it MUST show as
		# waiting (that is the abuse HR looks for) but must not count as this window's work.
		todos = [_todo(status=STATUS_DONE, review_since="2026-07-01", in_range=False)]
		_, row = self._run(todos=todos)
		self.assertEqual(row["awaiting_review"], 1)
		self.assertEqual(row["assigned_count"], 0)

	def test_project_split_carries_leader(self):
		todos = [
			_todo(minutes=60), _todo(minutes=30),
			_todo(project="PROJ-2", project_name="App", leader="rendi@x.id", leader_name="Rendi", minutes=90),
		]
		_, row = self._run(todos=todos)
		by_name = {p["project"]: p for p in row["projects"]}
		self.assertEqual(by_name["PROJ-1"]["todos"], 2)
		self.assertEqual(by_name["PROJ-1"]["minutes"], 90)
		self.assertEqual(by_name["PROJ-1"]["leader_name"], "Sinta")
		self.assertEqual(by_name["PROJ-2"]["leader_name"], "Rendi")
		self.assertEqual(row["leaders"], [
			{"leader": "rendi@x.id", "leader_name": "Rendi"},
			{"leader": "sinta@x.id", "leader_name": "Sinta"},
		])

	def test_notes_counted_in_range_only(self):
		_, row = self._run(notes=[{"user": "budi@x.id", "note_date": "2026-08-18"},
			{"user": "budi@x.id", "note_date": "2026-08-20"}])
		self.assertEqual(row["notes_count"], 2)
		self.assertEqual(row["last_note_on"], "2026-08-20")

	def test_no_notes(self):
		_, row = self._run()
		self.assertEqual(row["notes_count"], 0)
		self.assertIsNone(row["last_note_on"])

	def test_sources_passed_through(self):
		_, row = self._run(sources=("member_type", "profile"))
		self.assertEqual(row["sources"], ["member_type", "profile"])

	def test_other_users_rows_are_ignored(self):
		_, row = self._run(todos=[_todo(user="someone@x.id", status=STATUS_DONE, review_since="2026-08-01")])
		self.assertEqual(row["awaiting_review"], 0)
		self.assertEqual(row["projects"], [])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m pytest vernon_project/api/test_intern_allocation.py -x 2>&1 | tail -5`
Expected: `ImportError: cannot import name 'STATUS_DONE'` (or `_build_intern_matrix`).

- [ ] **Step 3: Implement**

Add to `vernon_project/api/report.py` next to the other status constants:

```python
STATUS_DONE = "\U0001f7e0 Done"            # 🟠 Done — delivered, waiting on the leader

# Intern-allocation thresholds. Named so the report's rules are readable.
STALE_ASSIGNMENT_DAYS = 7   # no new assigned work for this long → needs attention
REVIEW_WAIT_DAYS = 3        # delivered work left unreviewed this long → needs attention
_AWAITING = (STATUS_DONE, STATUS_CHECKED)
```

Add after `_build_daily_matrix`:

```python
def _weekday_dates(dates):
	"""Mon-Fri members of `dates`. ponytail: fixed Mon-Fri, not shift- or holiday-aware —
	most users carry no Shift Assignment, so a shift-derived working-day model would
	evaluate nothing. `_resolve_expected()` is the upgrade path if that ever changes."""
	return [d for d in dates if getdate(d).weekday() < 5]


def _build_intern_matrix(matrix, interns, todo_rows, note_rows, scope):
	"""Enrich a `_build_daily_matrix` payload with the per-intern management signals.
	Pure: every argument is plain data, so this is unit-testable without a site.
	See the spec for each signal's rule."""
	dates = matrix["dates"]
	weekdays = set(_weekday_dates(dates))
	to_date = matrix["to_date"]
	by_user = {r["user"]: r for r in matrix["rows"]}

	todos_by_user, notes_by_user = {}, {}
	for t in todo_rows:
		todos_by_user.setdefault(t["user"], []).append(t)
	for n in note_rows:
		notes_by_user.setdefault(n["user"], []).append(n)

	rows = []
	for intern in interns:
		row = dict(by_user.get(intern["name"]) or {
			"user": intern["name"], "full_name": intern.get("full_name") or intern["name"],
			"per_day_assigned": {d: 0 for d in dates}, "per_day_planned": {d: 0 for d in dates},
			"assigned_total": 0, "planned_total": 0, "flagged_dates": list(dates),
		})
		row["sources"] = list(intern.get("sources") or [])

		worked = [d for d in dates if row["per_day_assigned"].get(d, 0) > 0]
		row["zero_days"] = len([d for d in weekdays if row["per_day_assigned"].get(d, 0) <= 0])
		row["last_assigned_on"] = worked[-1] if worked else None
		# A future allocation inside the range is not stale, hence the max(0, ...).
		row["stale_days"] = (
			max(0, date_diff(to_date, row["last_assigned_on"])) if worked else len(dates)
		)

		mine = todos_by_user.get(intern["name"], [])
		waiting = [t for t in mine if t.get("status") in _AWAITING]
		row["awaiting_review"] = len(waiting)
		row["oldest_wait_days"] = max(
			[max(0, date_diff(to_date, t["review_since"])) for t in waiting if t.get("review_since")],
			default=0,
		)
		in_range = [t for t in mine if t.get("in_range")]
		row["assigned_count"] = len(in_range)
		done = [t for t in in_range if t.get("done_on")]
		row["done"] = len(done)
		row["late"] = len([t for t in done if t.get("deadline") and t["done_on"] > t["deadline"]])

		projects = {}
		for t in mine:
			p = projects.setdefault(t["project"], {
				"project": t["project"], "project_name": t.get("project_name") or t["project"],
				"leader": t.get("leader"), "leader_name": t.get("leader_name") or t.get("leader"),
				"todos": 0, "minutes": 0, "waiting": 0,
			})
			p["todos"] += 1
			p["minutes"] += int(t.get("minutes") or 0)
			if t.get("status") in _AWAITING:
				p["waiting"] += 1
		row["projects"] = sorted(projects.values(), key=lambda p: p["project_name"])
		leaders = {p["leader"]: p["leader_name"] for p in row["projects"] if p["leader"]}
		row["leaders"] = [{"leader": k, "leader_name": v} for k, v in sorted(leaders.items())]

		notes = sorted(str(n["note_date"]) for n in notes_by_user.get(intern["name"], []) if n.get("note_date"))
		row["notes_count"] = len(notes)
		row["last_note_on"] = notes[-1] if notes else None

		reasons = []
		if row["zero_days"] and row["zero_days"] == len(weekdays):
			reasons.append("idle")
		if row["stale_days"] >= STALE_ASSIGNMENT_DAYS:
			reasons.append("stale")
		if row["oldest_wait_days"] >= REVIEW_WAIT_DAYS:
			reasons.append("waiting")
		row["reasons"] = reasons
		row["attention"] = bool(reasons)
		rows.append(row)

	rows.sort(key=lambda r: (not r["attention"], r["full_name"].lower()))
	return {
		"scope": scope, "threshold": matrix["threshold"],
		"from_date": matrix["from_date"], "to_date": to_date, "dates": dates,
		"rows": rows,
		"totals": {"interns": len(rows), "attention": len([r for r in rows if r["attention"]])},
	}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 -m pytest vernon_project/api/test_intern_allocation.py -q 2>&1 | tail -5`
Expected: all tests pass. (These tests import only pure helpers, so plain pytest works without a bench site.)

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/report.py vernon_project/api/test_intern_allocation.py
git commit -m "feat(report): pure intern-allocation signal builder"
```

---

### Task 2: Endpoints + access gate

**Files:**
- Modify: `vernon_project/api/report.py` (append after `last_seen_report`)
- Test: `vernon_project/api/test_intern_allocation.py` (append)

**Interfaces:**
- Consumes: `_build_intern_matrix` (Task 1), `_is_system_manager`, `_projects_i_run`, `_users_on_projects`, `_validated_range`, `_assigned_minutes`, `_build_daily_matrix`.
- Produces:
  - `intern_allocation_access() -> {"can": bool, "scope": "all"|"team"|"none"}`
  - `intern_allocation(from_date, to_date) -> dict` (the Task-1 payload)

- [ ] **Step 1: Write the failing tests**

```python
# appended to vernon_project/api/test_intern_allocation.py
import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.report import intern_allocation, intern_allocation_access


class TestInternAllocationGate(unittest.TestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def test_admin_scope_all(self):
		frappe.set_user("Administrator")
		self.assertEqual(intern_allocation_access(), {"can": True, "scope": "all"})

	def test_stranger_denied(self):
		frappe.set_user("Guest")
		self.assertEqual(intern_allocation_access()["scope"], "none")
		with self.assertRaises(frappe.PermissionError):
			intern_allocation(add_days(nowdate(), -6), nowdate())

	def test_admin_gets_contract_shape(self):
		frappe.set_user("Administrator")
		out = intern_allocation(add_days(nowdate(), -6), nowdate())
		for key in ("scope", "dates", "rows", "totals", "threshold", "from_date", "to_date"):
			self.assertIn(key, out)
		self.assertEqual(len(out["dates"]), 7)
		self.assertEqual(sorted(out["totals"]), ["attention", "interns"])
		for row in out["rows"]:
			for key in ("user", "sources", "per_day_assigned", "zero_days", "stale_days",
				"awaiting_review", "oldest_wait_days", "done", "late", "projects",
				"leaders", "notes_count", "attention", "reasons"):
				self.assertIn(key, row)

	def test_rejects_oversize_span(self):
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):
			intern_allocation("2020-01-01", nowdate())
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_intern_allocation 2>&1 | tail -15`
Expected: FAIL — `cannot import name 'intern_allocation'`.

- [ ] **Step 3: Implement**

Append to `vernon_project/api/report.py`:

```python
INTERN_MEMBER_TYPE = "Intern"


def _intern_users(name_filter=None):
	"""Interns as the app marks them, deduped: User.custom_member_type == 'Intern'
	UNION Employee Profile.employment_status == 'Intern'. Each row carries the marking(s)
	it came from, so the UI can show — never silently hide — a user the two records
	disagree about. `name_filter`: None = everyone, else an iterable of user-ids."""
	base = {"enabled": 1, "user_type": "System User", "name": ["not in", ("Guest", "Administrator")]}
	if name_filter is not None:
		allowed = [n for n in name_filter if n not in ("Guest", "Administrator")]
		if not allowed:
			return []
		base["name"] = ["in", allowed]

	by_type = frappe.get_all("User", filters={**base, "custom_member_type": INTERN_MEMBER_TYPE},
		fields=["name", "full_name"], limit_page_length=0)
	profiled = frappe.get_all("Employee Profile",
		filters={"employment_status": INTERN_MEMBER_TYPE}, pluck="user", limit_page_length=0)
	by_profile = frappe.get_all("User", filters={**base, "name": ["in", profiled or [""]]},
		fields=["name", "full_name"], limit_page_length=0) if profiled else []

	merged = {}
	for rows, source in ((by_type, "member_type"), (by_profile, "profile")):
		for r in rows:
			entry = merged.setdefault(r["name"], {"name": r["name"],
				"full_name": r.get("full_name") or r["name"], "sources": []})
			if source not in entry["sources"]:
				entry["sources"].append(source)
	return sorted(merged.values(), key=lambda r: r["full_name"].lower())


def _intern_todo_rows(names, from_date, to_date):
	"""Todos that matter for the window: anything whose deadline or done-date falls in
	range, PLUS anything still awaiting review whenever it was delivered — a todo the
	intern finished a month ago and nobody reviewed is exactly what HR is looking for.
	`in_range` marks the former, so out-of-window strays never inflate the counts."""
	if not names:
		return []
	rows = frappe.db.sql(
		"""
		SELECT todo.assigned_to AS user, todo.project AS project,
		       proj.project_name AS project_name, proj.project_leader AS leader,
		       todo.status AS status, todo.deadline AS deadline,
		       IFNULL(todo.estimated, 0) AS minutes,
		       DATE(COALESCE(todo.done_started_at, todo.developed_at)) AS done_on,
		       DATE(COALESCE(todo.tested_at, todo.developed_at)) AS review_since
		FROM `tabProject Todo` AS todo
		LEFT JOIN `tabProject` AS proj ON todo.project = proj.name
		WHERE todo.assigned_to IN %(users)s AND todo.status != %(cancelled)s
		  AND (todo.deadline BETWEEN %(from_date)s AND %(to_date)s
		       OR DATE(COALESCE(todo.done_started_at, todo.developed_at))
		          BETWEEN %(from_date)s AND %(to_date)s
		       OR todo.status IN %(awaiting)s)
		""",
		{"users": names, "from_date": from_date, "to_date": to_date,
			"cancelled": STATUS_CANCELLED, "awaiting": _AWAITING}, as_dict=True,
	)
	leader_names = _full_name_map([r["leader"] for r in rows if r["leader"]])
	out = []
	for r in rows:
		deadline = str(r["deadline"]) if r["deadline"] else None
		done_on = str(r["done_on"]) if r["done_on"] else None
		out.append({
			"user": r["user"], "project": r["project"] or "—",
			"project_name": r["project_name"] or r["project"] or "—",
			"leader": r["leader"], "leader_name": leader_names.get(r["leader"]) or r["leader"],
			"status": r["status"], "deadline": deadline, "done_on": done_on,
			"review_since": str(r["review_since"]) if r["review_since"] else None,
			"minutes": int(r["minutes"] or 0),
			"in_range": bool((deadline and from_date <= deadline <= to_date)
				or (done_on and from_date <= done_on <= to_date)),
		})
	return out


def _full_name_map(names):
	"""{user-id: full_name} for the given ids. Empty input → {}."""
	uniq = [n for n in set(names) if n]
	if not uniq:
		return {}
	return {r["name"]: r["full_name"] or r["name"] for r in frappe.get_all(
		"User", filters={"name": ["in", uniq]}, fields=["name", "full_name"], limit_page_length=0)}


def _intern_note_rows(names, from_date, to_date):
	"""Leader Note rows written about these users inside the window."""
	if not names:
		return []
	return frappe.get_all("Leader Note",
		filters={"user": ["in", names], "note_date": ["between", [from_date, to_date]]},
		fields=["user", "note_date"], limit_page_length=0)


def _intern_scope(user):
	"""('all'|'team'|'none', allowed_user_ids|None) for the intern report."""
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "HR Manager" in roles:
		return "all", None
	projects = _projects_i_run(user)
	if projects:
		return "team", _users_on_projects(projects)
	return "none", None


@frappe.whitelist()
def intern_allocation_access():
	"""Whether the caller may open the Intern Allocation report, and at what scope.
	Single source for the nav/tile gate — same rule intern_allocation enforces, so the
	UI can hide the entry without a 403 round-trip."""
	scope, _ = _intern_scope(frappe.session.user)
	return {"can": scope != "none", "scope": scope}


@frappe.whitelist()
def intern_allocation(from_date, to_date):
	"""Intern x day assigned-minutes matrix plus the signals that show whether each
	intern's project leader is managing them. HR Manager / System Manager see every
	intern; a project owner/leader/admin sees only interns on projects they run."""
	scope, allowed = _intern_scope(frappe.session.user)
	if scope == "none":
		frappe.throw("Not permitted", frappe.PermissionError)

	start, end = _validated_range(from_date, to_date)
	interns = _intern_users(allowed)
	names = [i["name"] for i in interns]
	threshold = frappe.db.get_single_value("Vernon Settings", "min_daily_estimated_minutes") or 0

	planned_rows = []
	if names:
		planned_rows = frappe.db.sql(
			"""
			SELECT todo.assigned_to AS user, alloc.allocation_date AS day,
			       SUM(alloc.estimated_minutes) AS minutes
			FROM `tabProject Todo Allocation` AS alloc
			JOIN `tabProject Todo` AS todo ON alloc.parent = todo.name
			WHERE todo.assigned_to IN %(users)s AND alloc.parenttype = 'Project Todo'
			  AND todo.status != %(cancelled)s
			  AND alloc.allocation_date BETWEEN %(from_date)s AND %(to_date)s
			GROUP BY todo.assigned_to, alloc.allocation_date
			""",
			{"users": names, "from_date": str(start), "to_date": str(end),
				"cancelled": STATUS_CANCELLED}, as_dict=True,
		)

	matrix = _build_daily_matrix(
		interns, _assigned_minutes(names, str(start), str(end)), planned_rows, start, end, threshold)
	return _build_intern_matrix(
		matrix, interns,
		_intern_todo_rows(names, str(start), str(end)),
		_intern_note_rows(names, str(start), str(end)),
		scope,
	)
```

- [ ] **Step 4: Verify (deferred)**

These tests need the site; they run in Task 7's single integration pass. Sanity-check the module still imports:
Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 -m pytest vernon_project/api/test_intern_allocation.py -q -k "Weekday or BuildIntern" 2>&1 | tail -3`
Expected: the Task-1 pure tests still pass (the new imports must not break them).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/report.py vernon_project/api/test_intern_allocation.py
git commit -m "feat(report): intern_allocation endpoint + HR/leader access gate"
```

---

### Task 3: Shared frontend wiring (types, api, hooks, help copy)

**Files:**
- Modify: `frontend/src/lib/types.ts` (append the interfaces)
- Modify: `frontend/src/lib/api.ts` (add two methods next to `lastSeenAccess`, ~line 748)
- Modify: `frontend/src/hooks/useData.ts` (add two hooks next to `useLastSeenAccess`, ~line 586)
- Create: `frontend/src/lib/internAllocationHelp.ts`

**Interfaces:**
- Produces: `InternAllocationRow`, `InternAllocationResponse`, `ReportAccess`; `mobileApi.internAllocation(from,to)`, `mobileApi.internAllocationAccess()`; `useInternAllocationAccess()`, `useInternAllocation(from,to,enabled)`; `INTERN_HELP: {term, title, body}[]`, `internHelp(term)`.

- [ ] **Step 1: Types** (`frontend/src/lib/types.ts`)

```ts
export interface InternAllocationProject {
  project: string
  project_name: string
  leader: string | null
  leader_name: string | null
  todos: number
  minutes: number
  waiting: number
}

export interface InternAllocationRow {
  user: string
  full_name: string
  sources: ('member_type' | 'profile')[]
  per_day_assigned: Record<string, number>
  per_day_planned: Record<string, number>
  assigned_total: number
  planned_total: number
  flagged_dates: string[]
  zero_days: number
  last_assigned_on: string | null
  stale_days: number
  awaiting_review: number
  oldest_wait_days: number
  assigned_count: number
  done: number
  late: number
  notes_count: number
  last_note_on: string | null
  projects: InternAllocationProject[]
  leaders: { leader: string; leader_name: string }[]
  attention: boolean
  reasons: ('idle' | 'stale' | 'waiting')[]
}

export interface InternAllocationResponse {
  scope: 'all' | 'team'
  threshold: number
  from_date: string
  to_date: string
  dates: string[]
  rows: InternAllocationRow[]
  totals: { interns: number; attention: number }
}
```

- [ ] **Step 2: API client** (`frontend/src/lib/api.ts`, beside `lastSeenAccess`)

```ts
  internAllocation: (from_date: string, to_date: string) =>
    api.get<import('./types').InternAllocationResponse>(
      'vernon_project.api.report.intern_allocation', { from_date, to_date },
    ),
  internAllocationAccess: () =>
    api.get<import('./types').LastSeenAccess>('vernon_project.api.report.intern_allocation_access'),
```

- [ ] **Step 3: Hooks** (`frontend/src/hooks/useData.ts`, beside `useLastSeenAccess`)

```ts
export const useInternAllocationAccess = () =>
  useQuery({
    queryKey: ['intern-allocation-access'],
    queryFn: () => mobileApi.internAllocationAccess(),
    staleTime: 1000 * 60 * 5,
  })

export const useInternAllocation = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: ['intern-allocation', from, to],
    queryFn: () => mobileApi.internAllocation(from, to),
    enabled,
    staleTime: 1000 * 30,
  })
```

- [ ] **Step 4: Help copy** (`frontend/src/lib/internAllocationHelp.ts`) — one source of truth for the (i) hints on BOTH frontends. Bahasa, end-user voice.

```ts
// (i) copy for the Intern Allocation report. Shared by /m and /w so both explain the
// same numbers with the same words. Keyed by term; UI looks each up by key.
export interface InternHelpEntry { term: string; title: string; body: string }

export const INTERN_HELP: InternHelpEntry[] = [
  { term: 'assigned', title: 'Menit ditugaskan',
    body: 'Total menit kerja yang dijadwalkan untuk magang pada hari itu — dari alokasi harian tugas, atau dari estimasi tugas yang jatuh tempo hari itu bila belum dialokasikan per hari.' },
  { term: 'planned', title: 'Menit direncanakan',
    body: 'Menit yang direncanakan sendiri oleh magang lewat Rencana Harian. Bisa berbeda dari menit ditugaskan: yang satu rencana pribadi, yang satu beban kerja yang diberikan.' },
  { term: 'zero_days', title: 'Hari kosong',
    body: 'Jumlah hari kerja (Senin–Jumat) dalam rentang ini yang sama sekali tidak punya tugas. Akhir pekan tidak dihitung, tetapi tetap ditampilkan bila ada tugas di sana.' },
  { term: 'stale', title: 'Terakhir diberi tugas',
    body: `Berapa hari sejak hari terakhir yang punya tugas. Lewat ${'{stale}'} hari tanpa tugas baru, baris ini ditandai perlu perhatian.` },
  { term: 'waiting', title: 'Menunggu review',
    body: `Tugas yang sudah diselesaikan magang tetapi belum di-review pemimpin proyek (status Done atau Checked By PL). Termasuk tugas dari luar rentang tanggal — justru itu yang penting. Lewat ${'{wait}'} hari, baris ditandai perlu perhatian.` },
  { term: 'late', title: 'Terlambat',
    body: 'Tugas yang tanggal selesainya melewati deadline. Dihitung saat magang menandai Done, bukan saat pemimpin menyetujui.' },
  { term: 'notes', title: 'Catatan pemimpin',
    body: 'Jumlah Catatan Pemimpin yang ditulis tentang magang ini dalam rentang tanggal. Indikator apakah pemimpin memberi arahan tertulis.' },
  { term: 'attention', title: 'Perlu perhatian',
    body: 'Ditandai bila salah satu terjadi: tidak ada tugas sama sekali di semua hari kerja, tidak ada tugas baru terlalu lama, atau ada hasil kerja yang menunggu review terlalu lama.' },
  { term: 'sources', title: 'Sumber data magang',
    body: 'Magang dikenali dari dua tempat: penanda Member Type di data pengguna, dan status kepegawaian di Profil Karyawan. Daftar ini menggabungkan keduanya, dan setiap baris menunjukkan asalnya — jadi data yang tidak sinkron terlihat, bukan hilang.' },
  { term: 'project_minutes', title: 'Menit per proyek',
    body: 'Total estimasi tugas magang di proyek tersebut untuk jendela ini. Angka pada kisi harian memakai alokasi per hari, jadi kedua angka bisa berbeda.' },
]

export function internHelp(term: string): InternHelpEntry | undefined {
  return INTERN_HELP.find((h) => h.term === term)
}
```

Replace the `{stale}` / `{wait}` placeholders with the literal numbers `7` and `3` when writing the file — they must match `STALE_ASSIGNMENT_DAYS` / `REVIEW_WAIT_DAYS` in `report.py`. Add a comment in `internAllocationHelp.ts` saying so.

- [ ] **Step 5: Typecheck + commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project && git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts frontend/src/lib/internAllocationHelp.ts
git commit -m "feat(intern-report): shared types, api client, hooks and (i) help copy"
```

---

### Task 4: Mobile screen (`/m`)

**Files:**
- Create: `frontend/src/pages/InternAllocationScreen.tsx`
- Create: `frontend/src/components/InternHelpSheet.tsx`
- Modify: `frontend/src/App.tsx` (route, beside `/reports/last-seen` at line ~231)
- Modify: `frontend/src/pages/Reports.tsx` (tile, gated on access)

**Interfaces:**
- Consumes: `useInternAllocation`, `useInternAllocationAccess`, `INTERN_HELP`, `internHelp`, `InternAllocationRow`.
- Produces: default-exported `InternAllocationScreen`; `InternHelpSheet({ open, term, onClose })`.

- [ ] **Step 1: Help sheet** — copy the shell of `frontend/src/components/ScheduleHelpSheet.tsx` (backdrop + slide-up panel + grabber + close button). It takes `term: string | null`; when `term` is set it shows that one entry's title+body, and below it a "Semua istilah" list of the rest. Close on backdrop click and on the X button. No `alert()`.

- [ ] **Step 2: Screen** — `DetailScreen title="Alokasi Magang"` (mirrors `LastSeenScreen.tsx`).

Layout, top to bottom:
1. Range chips: `7 hari`, `14 hari` (default), `30 hari` — set `from`/`to` with the shared date helpers; a "Custom" chip opens the shared `DatePicker` for both ends.
2. Summary strip: `{totals.interns} magang · {totals.attention} perlu perhatian`, with an (i) button opening `InternHelpSheet` on `attention`.
3. Filter row: `SearchableSelect` for Leader and Project (options derived from the loaded rows — no extra endpoint), plus a source segmented control (`Semua` / `Member Type` / `Profil`). All filtering client-side with `useMemo`.
4. One card per intern (attention rows first — the backend already sorts that way):
   - Header: name, attention dot (amber), leader chips.
   - Day strip: one chip per date, `h-7 min-w-7`, label = day-of-month; background scaled by minutes (`0` → `bg-paper-line`, `<threshold` → `bg-amber-100`, `>=threshold` → `bg-emerald-100`), weekend chips get `opacity-60`; `title`/`aria-label` = `"Rab 19 Agu — 120 menit"`.
   - Badge row: `Hari kosong {zero_days}`, `Menunggu review {awaiting_review} ({oldest_wait_days}h)`, `Selesai {done}/{assigned_count}`, `Telat {late}`, `Catatan {notes_count}`. Each badge is a button opening the help sheet on its term.
   - Tap the card → detail sheet listing `projects[]`: project name, leader name, `{todos} tugas · {minutes} menit · {waiting} menunggu`, plus `Terakhir diberi tugas: {last_assigned_on ?? '—'}`.
5. `EmptyState` when no rows match; loading skeleton while fetching; on 403 show `EmptyState` with "Tidak ada akses" (the tile is gated, but a deep link must not crash).

- [ ] **Step 3: Route + tile**

`frontend/src/App.tsx`, beside the last-seen route:
```tsx
<Route path="/reports/intern-allocation" element={<InternAllocationScreen />} />
```
`frontend/src/pages/Reports.tsx` — extend the existing access-gated `bespoke` array (it already does this for Last Seen):
```tsx
const { data: internAccess } = useInternAllocationAccess()
// ...inside bespoke, before BESPOKE:
...(internAccess?.can
  ? [{ key: 'intern-allocation', title: 'Alokasi Magang',
      desc: 'Matriks tugas magang per hari + sinyal pengelolaan pemimpin',
      icon: GraduationCap, accent: 'from-amber-500 to-orange-600',
      to: '/reports/intern-allocation' }]
  : []),
```
(`GraduationCap` from `lucide-react`.)

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(intern-report): mobile Alokasi Magang screen + tile"
```

---

### Task 5: Web page (`/w`)

**Files:**
- Create: `frontend-web/src/pages/InternAllocation.tsx`
- Create: `frontend-web/src/components/InfoDot.tsx`
- Modify: `frontend-web/src/App.tsx` (route, beside `/reports/last-seen` at line ~283)
- Modify: `frontend-web/src/pages/Reports.tsx` (tile)

**Interfaces:**
- Consumes: the same shared hooks/types/help from Task 3 (import from `@`), `HoverCard` from `@web/components/HoverCard`.
- Produces: default-exported `InternAllocation`; `InfoDot({ term })`.

- [ ] **Step 1: InfoDot** — an `(i)` button wrapped in the existing `HoverCard`:

```tsx
import { Info } from 'lucide-react'
import { HoverCard } from '@web/components/HoverCard'
import { internHelp } from '@/lib/internAllocationHelp'

export function InfoDot({ term }: { term: string }) {
  const entry = internHelp(term)
  if (!entry) return null
  return (
    <HoverCard content={<div><p className="mb-1 font-semibold text-ink">{entry.title}</p><p className="text-muted">{entry.body}</p></div>}>
      <button type="button" aria-label={`Info: ${entry.title}`} className="text-muted hover:text-ink">
        <Info className="h-3.5 w-3.5" />
      </button>
    </HoverCard>
  )
}
```

- [ ] **Step 2: Page** — `Page` + `PageHeader icon={GraduationCap} title="Alokasi Magang"` with `subtitle={`${totals.interns} magang · ${totals.attention} perlu perhatian`}`.

1. Toolbar: shared `DatePicker` for both ends + preset buttons (`7/14/30 hari`, default 14); `SearchableSelect` for Leader and Project; source segmented control; name search input. Client-side filtering only.
2. The matrix: a single horizontally scrollable container (`overflow-x-auto`), table with
   - a sticky left column (`sticky left-0 z-10 bg-surface`) holding name + leader chips + attention dot,
   - one `<th>` per date (`Sen 17`), weekend headers muted,
   - cells: blank when 0, minutes otherwise, background heat as in the mobile chips, `title` attribute with the full date + minutes,
   - then the pinned signal columns: `Hari kosong`, `Menunggu`, `Selesai`, `Telat`, `Catatan` — each header carrying an `<InfoDot term="…" />`.
3. Row click → `Sheet` (existing `@web/components/Sheet`) with the per-project breakdown: project, leader, todos/minutes/waiting, `Terakhir diberi tugas`, and a link to `/users/{user}`.
4. `EmptyState` for no matches and for the no-access case.
5. Keep the body from scrolling horizontally — only the matrix container scrolls.

- [ ] **Step 3: Route + tile** — mirror Task 4 in `frontend-web/src/App.tsx` and `frontend-web/src/pages/Reports.tsx` (the web hub already has the `showLastSeen` pattern to copy; add `showIntern` the same way so the header count stays right).

- [ ] **Step 4: Typecheck**

Run: `cd frontend-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src
git commit -m "feat(intern-report): web Alokasi Magang matrix page + tile"
```

---

### Task 6: Docs

**Files:**
- Modify: `docs/assets/data.js` (generated)
- Modify: `scripts/gen_docs.py` only if the generator complains about an unmapped name

- [ ] **Step 1: Regenerate**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py`
Expected: exit 0; `docs/assets/data.js` now lists `intern_allocation` and `intern_allocation_access`.

- [ ] **Step 2: Verify determinism**

Run: `python3 scripts/gen_docs.py && git diff --exit-code docs/assets/data.js`
Expected: exit 0 (no diff on a second run).

- [ ] **Step 3: Commit**

```bash
git add docs/assets/data.js
git commit -m "docs: regenerate data.js for intern allocation endpoints"
```

---

### Task 7: Integration gate + ship

**Files:**
- Build outputs: `vernon_project/public/frontend/assets/*`, `vernon_project/public/frontend_web/assets/*`
- Create: `/tmp/claude-1000/.../releases.json` (scratch, not committed)

- [ ] **Step 1: Run the whole test module against the site**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_intern_allocation 2>&1 | tail -20`
Expected: OK, 0 failures. Fix and re-run until green — do not proceed on a red suite.

- [ ] **Step 2: Regression pass on the report module**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_report 2>&1 | tail -10`
Expected: OK — Task 1 touched `report.py`, so its existing suite must still pass.

- [ ] **Step 3: Build both bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd ../frontend-web && npm run build
```
Then bump the service-worker asset-cache version (the repo bumps `SW v<N>` each ship — grep the current value and increment).

- [ ] **Step 4: Restart the bench**

Run: `sudo /usr/local/bin/tj-restart`

- [ ] **Step 5: Verify the feature is actually shipped**

```bash
grep -o "Alokasi Magang" vernon_project/public/frontend/assets/*.js | head -1
grep -o "Alokasi Magang" vernon_project/public/frontend_web/assets/*.js | head -1
```
Expected: a hit in each. Source committed but absent from the bundle is NOT shipped.

- [ ] **Step 6: What's New row**

Write one `App Release` row (Bahasa, `platform: "Both"`, `published: 1`, version = minor bump from the newest existing row, `release_date` = today) describing what HR can now do. Insert it with the single-line `bench console` heredoc from CLAUDE.md, then verify through `get_app_releases`.

- [ ] **Step 7: Commit the bundles**

```bash
git add vernon_project/public frontend frontend-web
git commit -m "chore: rebuild bundles for intern allocation report"
```
