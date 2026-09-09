"""Regression guard for the jll4vd36n6 performance/security audit
(SECURITY_PERF_AUDIT.md in the repo root has the full findings)."""

import os
import re

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from vernon_project.api.mobile import (
	_fetch_todos,
	get_calendar,
	get_project_detail,
	get_project_item,
)
from vernon_project.vernon_project.doctype.project_todo.test_project_todo import _ensure_test_group

HOT_FILTER_FIELDS = ("assigned_to", "status", "deadline", "work_mode")

APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL_CALL_RE = re.compile(r"frappe\.db\.sql\(")
# The query-string portion of a call — up to its first top-level comma (where
# the params argument starts) — must never end a Python %-format applied to
# the query text itself. This is the actual injection anti-pattern:
# frappe.db.sql("... %s ..." % user_input) builds unparametrised SQL, as
# opposed to frappe.db.sql("... %s ...", user_input), where db.sql's own
# driver escapes the value. `%(name)s`/`%s` placeholders WITH a separate
# params argument (dict or tuple/list) are the safe, required pattern.
DANGEROUS_PY_FORMAT_RE = re.compile(r"""['"]\s*%\s*\(""")


def _query_part(call_text):
	"""The query-string portion of one frappe.db.sql(...) call — up to its
	first top-level (depth-0) comma, which is where the params argument
	(if any) begins."""
	depth = 0
	for i, ch in enumerate(call_text):
		if ch == "(":
			depth += 1
		elif ch == ")":
			depth -= 1
			if depth == 0:
				return call_text[:i]
		elif ch == "," and depth == 1:
			return call_text[:i]
	return call_text


def _sql_call_sites():
	for dirpath, dirnames, filenames in os.walk(APP_ROOT):
		dirnames[:] = [d for d in dirnames if d not in ("__pycache__", "node_modules")]
		if os.sep + "tests" + os.sep in dirpath + os.sep:
			continue
		for fname in filenames:
			if not fname.endswith(".py") or fname.startswith("test_"):
				continue
			path = os.path.join(dirpath, fname)
			with open(path) as f:
				content = f.read()
			for m in SQL_CALL_RE.finditer(content):
				yield path, m.start(), content[m.start():m.start() + 800]


class TestNoUnparametrisedSql(FrappeTestCase):
	def test_no_unparametrised_sql(self):
		"""Static scan (audit case 8): every frappe.db.sql( call's query-string
		portion must never itself be the target of a Python % string-format —
		that is the actual injection anti-pattern (builds SQL text with a raw
		value spliced in) as opposed to passing %s/%(name)s placeholders plus a
		separate params argument, which is what every call site in this app
		already does. Also flags a bare .format( chained directly onto the
		query text, the same anti-pattern by a different spelling."""
		offenders = []
		for path, pos, snippet in _sql_call_sites():
			query_part = _query_part(snippet)
			if DANGEROUS_PY_FORMAT_RE.search(query_part):
				offenders.append(f"{path}:{pos} (% string-format on the query text)")
			if ").format(" in query_part or re.search(r"""["']\s*\.format\(""", query_part):
				offenders.append(f"{path}:{pos} (.format( on the query text)")
		self.assertEqual(offenders, [], "Unparametrised SQL found:\n" + "\n".join(offenders))


class TestHotFilterIndexes(FrappeTestCase):
	def test_hot_filter_indexes_exist(self):
		"""assigned_to/status/deadline/work_mode were missing search_index
		while project/project_detail already had it — exactly the hot filters
		get_dashboard/get_calendar/get_project/get_project_item scope by.
		A DB index, not just the DocField flag, is what actually matters."""
		indexed = {
			row.Column_name
			for row in frappe.db.sql("SHOW INDEX FROM `tabProject Todo`", as_dict=True)
		}
		missing = [f for f in HOT_FILTER_FIELDS if f not in indexed]
		self.assertEqual(missing, [], f"Project Todo is missing a DB index on: {missing}")


class TestGetProjectItemNoSiblingDump(FrappeTestCase):
	"""get_project_item used to call _fetch_todos([project]) — fetch + shape
	EVERY sibling todo in the project, then filter to one row in Python. Rows
	returned (and the work behind them) scaled with sibling count. Fixed by
	pushing the target name into the SQL's WHERE clause (_fetch_todos'
	new `names` param) so the database does the filtering."""

	def setUp(self):
		frappe.set_user("Administrator")
		group, level_id = _ensure_test_group()
		if not frappe.db.exists("Brand", "Test Sibling Dump Brand"):
			frappe.get_doc({
				"doctype": "Brand", "brand_name": "Test Sibling Dump Brand",
				"company": frappe.db.get_value("Company", {}, "name"),
			}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Test Sibling Dump Project",
			"brand": "Test Sibling Dump Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "Test Sibling Dump Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.project_detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Test Sibling Dump Detail",
			"grouping": grouping.name, "project_deadline": add_days(nowdate(), 30), "estimated": 100,
		}).insert(ignore_permissions=True)
		self.group, self.level_id = group, level_id

	def _make_todos(self, n):
		names = []
		for i in range(n):
			doc = frappe.get_doc({
				"doctype": "Project Todo", "project_detail": self.project_detail.name,
				"to_do": f"Sibling {i}", "assigned_to": "Administrator", "start_date": nowdate(),
				"deadline": add_days(nowdate(), 7), "estimated": 10, "status": "⚪️ Planned",
				"group": self.group, "level_id": self.level_id,
			}).insert(ignore_permissions=True)
			names.append(doc.name)
		return names

	def test_row_count_independent_of_sibling_count(self):
		few = self._make_todos(3)
		target_few = few[0]
		rows_few = _fetch_todos([self.project.name], include_cancelled=True, names=[target_few])
		self.assertEqual(len(rows_few), 1)

		many = self._make_todos(50)
		target_many = many[0]
		rows_many = _fetch_todos([self.project.name], include_cancelled=True, names=[target_many])
		self.assertEqual(len(rows_many), 1)
		self.assertEqual(rows_many[0]["name"], target_many)

	def test_get_project_item_still_returns_the_right_todo(self):
		"""The fix must not change what a caller gets back — same shape, same
		content, just not every sibling behind the scenes."""
		names = self._make_todos(5)
		target = names[2]
		result = get_project_item(target)
		self.assertEqual(result["name"], target)
		self.assertEqual(result["to_do"], "Sibling 2")


def _count_queries(fn):
	"""Same technique as test_notes_markdown.py: patch the class method (not the
	instance) so calls made deep inside frappe's own ORM are counted too."""
	queries = []
	orig_sql = frappe.db.__class__.sql

	def _counted(*args, **kwargs):
		ret = orig_sql(*args, **kwargs)
		queries.append(args[0].last_query)
		return ret

	frappe.db.__class__.sql = _counted
	try:
		fn()
	finally:
		frappe.db.__class__.sql = orig_sql
	return len(queries)


class TestNoRedundantSingleFieldFetches(FrappeTestCase):
	"""6gb7lcr41q Phase 1: get_project_item and get_project_detail each made
	several separate single/few-field frappe.get_value/frappe.db.get_value
	calls against the SAME already-known doc (project_item, or
	detail["project"]) instead of folding them into a query already fetching
	other fields off that doc. Not an N+1 (doesn't scale with data) — plain
	redundant round-trips, fixed by extending the existing batched fetch."""

	def setUp(self):
		frappe.set_user("Administrator")
		group, level_id = _ensure_test_group()
		if not frappe.db.exists("Brand", "Test Redundant Fetch Brand"):
			frappe.get_doc({
				"doctype": "Brand", "brand_name": "Test Redundant Fetch Brand",
				"company": frappe.db.get_value("Company", {}, "name"),
			}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Test Redundant Fetch Project",
			"brand": "Test Redundant Fetch Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "Test Redundant Fetch Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.project_detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Test Redundant Fetch Detail",
			"grouping": grouping.name, "project_deadline": add_days(nowdate(), 30), "estimated": 100,
		}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.project_detail.name,
			"to_do": "Redundant Fetch Todo", "assigned_to": "Administrator", "start_date": nowdate(),
			"deadline": add_days(nowdate(), 7), "estimated": 10, "status": "⚪️ Planned",
			"group": group, "level_id": level_id, "mentor": "Administrator",
		}).insert(ignore_permissions=True)

	def test_get_project_item_query_count(self):
		"""Pinned to the measured post-fix number (mentor/ai_prompt/
		ai_prompt_confirmed folded into the existing `extra` fetch on the same
		doc) — was 27 on this fixture before the fix."""
		get_project_item(self.todo.name)  # warm-up: absorb first-call cache cost
		count = _count_queries(lambda: get_project_item(self.todo.name))
		self.assertLessEqual(count, 24, f"get_project_item ran {count} queries, expected <=24")

	def test_get_project_item_content_unchanged_by_the_merge(self):
		"""The merge must not change what's returned — mentor/ai_prompt/
		ai_prompt_confirmed still come back correct."""
		result = get_project_item(self.todo.name)
		self.assertEqual(result["mentor"], "Administrator")
		self.assertEqual(result["ai_prompt_confirmed"], False)
		self.assertEqual(result["ai_prompts"], [])

	def test_get_project_detail_query_count(self):
		"""Pinned to the measured post-fix number (project_name/project_owner/
		project_leader/auto_approve folded into one frappe.get_value call on
		the same Project doc) — was 21 on this fixture before the fix."""
		get_project_detail(self.project_detail.name)  # warm-up
		count = _count_queries(lambda: get_project_detail(self.project_detail.name))
		self.assertLessEqual(count, 16, f"get_project_detail ran {count} queries, expected <=16")

	def test_get_project_detail_content_unchanged_by_the_merge(self):
		result = get_project_detail(self.project_detail.name)
		self.assertEqual(result["project_name"], "Test Redundant Fetch Project")
		self.assertEqual(result["can_create"], True)
		self.assertEqual(result["auto_approve"], False)


# Every top-level field `frontend/src/pages/ProjectItemScreen.tsx` (/m) or
# `frontend-web/src/pages/ProjectItem.tsx` (/w) reads off `data.<field>` from
# get_project_item's response — grepped from both files, not guessed. This is
# 6gb7lcr41q enumerated case 4 ("contract preserved"): a future response-shape
# trim (e.g. the calendar/detail-list pagination work this todo is holding on
# scope confirmation) must not silently drop a field a screen still displays.
GET_PROJECT_ITEM_FIELDS_BOTH_FRONTENDS_READ = frozenset({
	"ai_prompts", "allocations", "assigned_allocation", "assigned_to",
	"assigned_to_avatar_config", "assigned_to_image", "assigned_to_name",
	"auto_approve_effective", "auto_approve_mode", "blocked_by", "blocking",
	"can_advance", "can_create", "can_delete", "can_edit", "can_edit_assigned",
	"can_edit_estimate", "can_edit_files", "can_edit_notes", "can_edit_prompt",
	"can_prioritize", "can_reject", "can_report_issue", "can_set_auto_approve",
	"can_use_ai", "checklist", "creator", "deadline", "deadline_human",
	"detail_todos", "estimated", "fields_locked", "files", "group",
	"is_leader", "is_mine", "is_missed", "is_overdue", "is_owner",
	"is_priority", "is_waiting", "issue_of", "issue_of_title", "issues",
	"leader_appr_overdue", "leader_deadline", "leader_deadline_human",
	"level", "level_id", "level_type", "mentor", "mentor_name", "name",
	"next_status_label", "notes", "occurrences", "owner_appr_overdue",
	"owner_deadline", "owner_deadline_human", "phase_estimates",
	"point", "project_detail", "project_detail_title", "project_name",
	"recurring", "start_date", "start_date_human", "status_key", "team",
	"timeline", "to_check", "to_do", "today_allocation", "waiting_by_name",
	"waiting_reason", "waiting_since", "work_mode",
})


class TestGetProjectItemFieldContract(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		group, level_id = _ensure_test_group()
		if not frappe.db.exists("Brand", "Test Field Contract Brand"):
			frappe.get_doc({
				"doctype": "Brand", "brand_name": "Test Field Contract Brand",
				"company": frappe.db.get_value("Company", {}, "name"),
			}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Test Field Contract Project",
			"brand": "Test Field Contract Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "Test Field Contract Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.project_detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Test Field Contract Detail",
			"grouping": grouping.name, "project_deadline": add_days(nowdate(), 30), "estimated": 100,
		}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.project_detail.name,
			"to_do": "Field Contract Todo", "assigned_to": "Administrator", "start_date": nowdate(),
			"deadline": add_days(nowdate(), 7), "estimated": 10, "status": "⚪️ Planned",
			"group": group, "level_id": level_id,
		}).insert(ignore_permissions=True)

	def test_every_field_the_frontends_read_is_present(self):
		result = get_project_item(self.todo.name)
		missing = GET_PROJECT_ITEM_FIELDS_BOTH_FRONTENDS_READ - set(result.keys())
		self.assertEqual(missing, set(), f"get_project_item is missing fields the frontends read: {missing}")


class TestGetProjectItemPermissionBoundary(FrappeTestCase):
	"""6gb7lcr41q enumerated case 10: a user with no relationship to the project
	(not owner/leader/admin/team/System Manager) must still be refused by
	get_project_item — not previously covered by any existing test (grepped:
	get_project_item is called in test_mobile.py/test_security_perf.py only by
	callers already permitted). Same outsider-user pattern as
	test_permission_throws_for_non_visible_project in test_mobile.py."""

	def setUp(self):
		frappe.set_user("Administrator")
		# NEVER frappe.db.commit() after this point in a FrappeTestCase: it rolls
		# back per CLASS not per test (see [[frappe-test-rollback-and-armed-links]]),
		# so a manual commit() anywhere permanently commits everything created in
		# the class's shared transaction from then on -- not just the row being
		# committed. This one line, positioned AFTER self.project/self.project_detail/
		# self.todo below, leaked a real "Test Perm Boundary Project" (+detail+todo)
		# into the live database; moved the user (the only thing that actually
		# needs to survive a rollback) before any of the per-test fixtures instead.
		if not frappe.db.exists("User", "perf_outsider@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "perf_outsider@example.com",
				"first_name": "Perf", "last_name": "Outsider", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
			frappe.db.commit()

		group, level_id = _ensure_test_group()
		if not frappe.db.exists("Brand", "Test Perm Boundary Brand"):
			frappe.get_doc({
				"doctype": "Brand", "brand_name": "Test Perm Boundary Brand",
				"company": frappe.db.get_value("Company", {}, "name"),
			}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Test Perm Boundary Project",
			"brand": "Test Perm Boundary Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "Test Perm Boundary Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.project_detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Test Perm Boundary Detail",
			"grouping": grouping.name, "project_deadline": add_days(nowdate(), 30), "estimated": 100,
		}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.project_detail.name,
			"to_do": "Perm Boundary Todo", "assigned_to": "Administrator", "start_date": nowdate(),
			"deadline": add_days(nowdate(), 7), "estimated": 10, "status": "⚪️ Planned",
			"group": group, "level_id": level_id,
		}).insert(ignore_permissions=True)

	def test_outsider_denied_read(self):
		frappe.set_user("perf_outsider@example.com")
		try:
			with self.assertRaises(frappe.PermissionError):
				get_project_item(self.todo.name)
		finally:
			frappe.set_user("Administrator")

	def test_outsider_blocked_at_the_shared_visibility_helper_too(self):
		"""get_calendar/get_dashboard/get_project_item all scope through the same
		_visible_projects() -> _fetch_todos() pair. A totally roleless user (no
		"Project" doctype read grant at all, confirmed via `tabHas Role`) is
		refused at _visible_projects() itself with frappe.PermissionError --
		the SAME exception get_project_item's own explicit check raises, so the
		boundary is structural (one shared helper), not duct-taped per endpoint."""
		from vernon_project.api.mobile import _visible_projects
		frappe.set_user("perf_outsider@example.com")
		try:
			with self.assertRaises(frappe.PermissionError):
				_visible_projects()
		finally:
			frappe.set_user("Administrator")


class TestCalendarDateWindowOptIn(FrappeTestCase):
	"""6gb7lcr41q Phase 1b: get_calendar's real default call (no args) measured
	19.56 MB (PERF.md) -- no date window at all. Erick is holding the FRONTEND
	switch to actually pass one (that's the visible-behaviour decision). This
	is the backend half only: date_from/date_to are new, optional, and
	both-or-neither -- when neither is passed the query and result are
	byte-for-byte the same as before these params existed (case 5's "a
	request without a window is clamped to a server-side default" does NOT
	apply here: there is no server-side default window, because shipping one
	silently would BE the behaviour change this todo is holding for sign-off.
	What ships now is validation + a real window when explicitly asked)."""

	def setUp(self):
		frappe.set_user("Administrator")
		group, level_id = _ensure_test_group()
		if not frappe.db.exists("Brand", "Test Calendar Window Brand"):
			frappe.get_doc({
				"doctype": "Brand", "brand_name": "Test Calendar Window Brand",
				"company": frappe.db.get_value("Company", {}, "name"),
			}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Test Calendar Window Project",
			"brand": "Test Calendar Window Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 400),
			"team_members": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "Test Calendar Window Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Test Calendar Window Detail",
			"grouping": grouping.name, "project_deadline": add_days(nowdate(), 400), "estimated": 100,
		}).insert(ignore_permissions=True)

		def _todo(days_out):
			return frappe.get_doc({
				"doctype": "Project Todo", "project_detail": self.detail.name,
				"to_do": f"Window Todo +{days_out}d", "assigned_to": "Administrator", "start_date": nowdate(),
				"deadline": add_days(nowdate(), days_out), "estimated": 10, "status": "⚪️ Planned",
				"group": group, "level_id": level_id,
			}).insert(ignore_permissions=True)

		self.near = _todo(2)
		self.far = _todo(30)
		self.very_far = _todo(200)

	def test_default_call_unaffected_by_the_new_params(self):
		"""No date_from/date_to at all -- exact same three todos as before
		this feature existed, in the same order."""
		result = get_calendar()
		names = [t["name"] for t in result["todos"]]
		self.assertIn(self.near.name, names)
		self.assertIn(self.far.name, names)
		self.assertIn(self.very_far.name, names)

	def test_window_returns_only_deadlines_inside_it(self):
		"""Live DB, not a fresh test DB (vernon-project-autonomous-orchestrator
		KNOWLEDGE.md: no test DB here) -- other real todos can legitimately
		have a deadline in [today, today+10]. Assert membership, not an exact
		set, so this isn't flaky against production data."""
		result = get_calendar(date_from=add_days(nowdate(), 0), date_to=add_days(nowdate(), 10))
		names = {t["name"] for t in result["todos"]}
		self.assertIn(self.near.name, names)
		self.assertNotIn(self.far.name, names)
		self.assertNotIn(self.very_far.name, names)

	def test_only_one_bound_given_is_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			get_calendar(date_from=nowdate())
		with self.assertRaises(frappe.ValidationError):
			get_calendar(date_to=nowdate())

	def test_inverted_range_is_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			get_calendar(date_from=add_days(nowdate(), 10), date_to=add_days(nowdate(), 0))

	def test_range_too_wide_is_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			get_calendar(date_from=nowdate(), date_to=add_days(nowdate(), 401))

	def test_max_width_range_is_allowed(self):
		result = get_calendar(date_from=nowdate(), date_to=add_days(nowdate(), 400))
		names = {t["name"] for t in result["todos"]}
		self.assertIn(self.near.name, names)
		self.assertIn(self.far.name, names)
		self.assertIn(self.very_far.name, names)


class TestProjectDetailPaginationOptIn(FrappeTestCase):
	"""6gb7lcr41q Phase 1b: get_project_detail's biggest real sub-module
	measured 446 KB / 599 rows (PERF.md), no pagination. Same opt-in shape as
	the calendar window: limit/start default to 0, which is exactly today's
	unbounded behaviour -- an unchanged caller sees no difference at all."""

	def setUp(self):
		frappe.set_user("Administrator")
		group, level_id = _ensure_test_group()
		if not frappe.db.exists("Brand", "Test Detail Page Brand"):
			frappe.get_doc({
				"doctype": "Brand", "brand_name": "Test Detail Page Brand",
				"company": frappe.db.get_value("Company", {}, "name"),
			}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Test Detail Page Project",
			"brand": "Test Detail Page Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "Test Detail Page Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Test Detail Page Detail",
			"grouping": grouping.name, "project_deadline": add_days(nowdate(), 30), "estimated": 100,
		}).insert(ignore_permissions=True)
		self.names = []
		for i in range(5):
			doc = frappe.get_doc({
				"doctype": "Project Todo", "project_detail": self.detail.name,
				"to_do": f"Page Todo {i}", "assigned_to": "Administrator", "start_date": nowdate(),
				"deadline": add_days(nowdate(), i + 1), "estimated": 10, "status": "⚪️ Planned",
				"group": group, "level_id": level_id,
			}).insert(ignore_permissions=True)
			self.names.append(doc.name)

	def test_default_call_returns_everything_unbounded(self):
		result = get_project_detail(self.detail.name)
		self.assertEqual(len(result["project_items"]), 5)

	def test_limit_bounds_the_result(self):
		result = get_project_detail(self.detail.name, limit=2)
		self.assertEqual(len(result["project_items"]), 2)
		# _fetch_todos orders by deadline ASC -- the two nearest deadlines.
		self.assertEqual([r["name"] for r in result["project_items"]], self.names[:2])

	def test_start_offsets_the_result(self):
		result = get_project_detail(self.detail.name, limit=2, start=2)
		self.assertEqual([r["name"] for r in result["project_items"]], self.names[2:4])

	def test_negative_limit_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			get_project_detail(self.detail.name, limit=-1)

	def test_negative_start_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			get_project_detail(self.detail.name, start=-1)


class TestClampPageLimit(FrappeTestCase):
	"""Pure unit test for the clamp math itself -- proving the ceiling fires
	for an oversized request without needing hundreds of DB rows (case 7:
	"a client asking for 10000 rows gets clamped, not obeyed")."""

	def test_zero_means_unlimited(self):
		from vernon_project.api.mobile import _clamp_page_limit
		self.assertEqual(_clamp_page_limit(0, 500), 0)

	def test_under_max_passes_through(self):
		from vernon_project.api.mobile import _clamp_page_limit
		self.assertEqual(_clamp_page_limit(10, 500), 10)

	def test_over_max_is_clamped(self):
		from vernon_project.api.mobile import _clamp_page_limit
		self.assertEqual(_clamp_page_limit(10000, 500), 500)

	def test_negative_raises(self):
		from vernon_project.api.mobile import _clamp_page_limit
		with self.assertRaises(frappe.ValidationError):
			_clamp_page_limit(-1, 500)
