# Copyright (c) 2026, Vernon and contributors
# See license.txt
#
# dja50oqf2p: MCP skill "search / get Project Todo by name" (search_todos in
# project_todo.py). Backend-only, consumed via the MCP's generic
# call_api_method dispatcher (mcp_server/server.py) — see the report to the
# hub for the live call_api_method / list_api_methods verification, which
# needs the running vernon-mcp-http process and can't run inside this suite.

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from vernon_project.api.project_todo import search_todos
from vernon_project.vernon_project.doctype.project_todo.test_project_todo import _ensure_test_group

USER = "search_todos_user@example.com"


def _count_queries(fn):
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


class TestSearchTodos(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		group, level_id = _ensure_test_group()
		self.group, self.level_id = group, level_id

		# NEVER frappe.db.commit() here: FrappeTestCase rolls back per CLASS, not
		# per test (see [[frappe-test-rollback-and-armed-links]]) -- a manual
		# commit() anywhere in a class permanently commits EVERYTHING created in
		# that class's shared transaction from then on, not just the one row
		# being committed. Found the hard way: an earlier version of this fixture
		# committed the user here, and every one of this class's ~20 test methods
		# leaked its own "Search Todos Visible/Invisible Project" pair (+detail
		# +glossary+~37 todos) into the LIVE production database -- 40 projects,
		# 740 todos, cleaned up by hand after the fact. Not committing is fine:
		# the user only needs to exist within THIS test's own transaction.
		if not frappe.db.exists("User", USER):
			frappe.get_doc({
				"doctype": "User", "email": USER,
				"first_name": "SearchTodos", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		# Project's own permission table grants read to the "Project Team" ROLE,
		# not to team_members membership itself -- that role is assigned
		# separately (mobile.py create_user/update_user), never auto-derived
		# from being added to a project's team. Confirmed against a real team
		# member's actual `tabHas Role` rows before writing this fixture.
		user_doc = frappe.get_doc("User", USER)
		if not any(r.role == "Project Team" for r in user_doc.roles):
			user_doc.add_roles("Project Team")

		if not frappe.db.exists("Brand", "Search Todos Brand"):
			frappe.get_doc({
				"doctype": "Brand", "brand_name": "Search Todos Brand",
				"company": frappe.db.get_value("Company", {}, "name"),
			}).insert(ignore_permissions=True)

		# Visible project: USER is the team member.
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Search Todos Visible Project",
			"brand": "Search Todos Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 60),
			"team_members": [{"user": USER}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "Search Todos Visible Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Search Todos Visible Detail",
			"grouping": grouping.name, "project_deadline": add_days(nowdate(), 60), "estimated": 100,
		}).insert(ignore_permissions=True)

		# Invisible project: USER has no relationship to it at all.
		self.other_project = frappe.get_doc({
			"doctype": "Project", "project_name": "Search Todos Invisible Project",
			"brand": "Search Todos Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 60),
		}).insert(ignore_permissions=True)
		other_grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "Search Todos Invisible Grouping", "project": self.other_project.name,
		}).insert(ignore_permissions=True)
		self.other_detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.other_project.name, "title": "Search Todos Invisible Detail",
			"grouping": other_grouping.name, "project_deadline": add_days(nowdate(), 60), "estimated": 100,
		}).insert(ignore_permissions=True)
		self.invisible_todo = self._todo("Invisible Project Secret Task", self.other_detail.name, deadline=add_days(nowdate(), 5))

		self.ascii = self._todo("Onboarding checklist review", self.detail.name, deadline=add_days(nowdate(), 3))
		self.emoji = self._todo("🏇🏻 Cuti approval leader", self.detail.name, deadline=add_days(nowdate(), 4))
		self.indo = self._todo("Persetujuan cuti tahunan karyawan", self.detail.name, deadline=add_days(nowdate(), 6))
		self.pct = self._todo("Hit 100% coverage on payments", self.detail.name, deadline=add_days(nowdate(), 7))
		self.underscore = self._todo("Rename a_b config key", self.detail.name, deadline=add_days(nowdate(), 8))
		self.exact_match_title = self._todo("api token", self.detail.name, deadline=add_days(nowdate(), 9))
		self.prefix_match = self._todo("api token rotation followup", self.detail.name, deadline=add_days(nowdate(), 10))

		self.done_todo = self._todo("api token done work", self.detail.name, status="🟠 Done", deadline=add_days(nowdate(), 2))
		self.cancelled_todo = self._todo("api token cancelled work", self.detail.name, status="🚫 Cancelled", deadline=add_days(nowdate(), 2))

		self.ai_todo = self._todo("api token ai workmode", self.detail.name, work_mode="AI", deadline=add_days(nowdate(), 11))
		self.human_todo = self._todo("api token human workmode", self.detail.name, work_mode="Human", deadline=add_days(nowdate(), 11))

		self.bulk = [
			self._todo(f"api token bulk match {i}", self.detail.name, deadline=add_days(nowdate(), 20 + i))
			for i in range(25)
		]

	def _todo(self, to_do, project_detail, deadline=nowdate(), status="⚪️ Planned", work_mode=None, assigned_to="Administrator"):
		doc = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": project_detail,
			"to_do": to_do, "assigned_to": assigned_to, "start_date": nowdate(),
			"deadline": deadline, "estimated": 10, "status": status,
			"group": self.group, "level_id": self.level_id,
		})
		if work_mode:
			doc.work_mode = work_mode
		return doc.insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	# --- exact id ---------------------------------------------------------

	def test_exact_document_id_returns_that_todo_first(self):
		frappe.set_user(USER)
		result = search_todos(self.ascii.name)
		self.assertEqual(result["rows"][0]["name"], self.ascii.name)

	def test_exact_id_of_invisible_todo_is_not_returned(self):
		frappe.set_user(USER)
		result = search_todos(self.invisible_todo.name)
		names = [r["name"] for r in result["rows"]]
		self.assertNotIn(self.invisible_todo.name, names)

	# --- text search --------------------------------------------------------

	def test_substring_match_is_case_insensitive(self):
		frappe.set_user(USER)
		a = {r["name"] for r in search_todos("cuti APPROVAL")["rows"]}
		b = {r["name"] for r in search_todos("CUTI approval")["rows"]}
		self.assertEqual(a, b)
		self.assertIn(self.emoji.name, a)

	def test_emoji_and_indonesian_titles_match(self):
		frappe.set_user(USER)
		by_text = {r["name"] for r in search_todos("Cuti approval")["rows"]}
		self.assertIn(self.emoji.name, by_text)
		by_emoji = {r["name"] for r in search_todos("🏇🏻")["rows"]}
		self.assertIn(self.emoji.name, by_emoji)
		by_indo = {r["name"] for r in search_todos("cuti tahunan")["rows"]}
		self.assertIn(self.indo.name, by_indo)

	def test_wildcard_chars_in_query_match_literally(self):
		"""FrappeTestCase rolls back per CLASS not per test (see
		[[frappe-test-rollback-and-armed-links]]): setUp() runs before every one
		of this class's ~20 methods and creates a fresh self.pct/self.bulk each
		time, all inside the SAME never-yet-rolled-back transaction -- so by the
		time this (alphabetically late) method runs, earlier methods' fixture
		rows are still visible too. An exact-set assertion would be exactly the
		documented trap ("correct today, breaks when a method is added earlier
		in the alphabet") -- assert the real thing this test cares about
		instead: our own row is present, and literally none of the results are
		false positives (every returned title genuinely contains the pattern)."""
		frappe.set_user(USER)
		pct_rows = search_todos("100%", limit=100)["rows"]
		pct_hits = {r["name"] for r in pct_rows}
		self.assertIn(self.pct.name, pct_hits)
		self.assertTrue(all("100%" in r["to_do"] for r in pct_rows), pct_rows)

		us_rows = search_todos("a_b", limit=100)["rows"]
		us_hits = {r["name"] for r in us_rows}
		self.assertIn(self.underscore.name, us_hits)
		self.assertTrue(all("a_b" in r["to_do"] for r in us_rows), us_rows)

	def test_sql_injection_attempt_is_inert(self):
		frappe.set_user(USER)
		result = search_todos("' OR 1=1 --")
		self.assertEqual(result, {"total": 0, "rows": []})

	def test_empty_or_too_short_query_raises_validation_error(self):
		frappe.set_user(USER)
		for bad in ("", "   ", "a"):
			with self.assertRaises(frappe.ValidationError):
				search_todos(bad)

	def test_no_match_returns_empty_result(self):
		frappe.set_user(USER)
		self.assertEqual(search_todos("zzznomatchzzz")["rows"], [])
		self.assertEqual(search_todos("zzznomatchzzz")["total"], 0)

	# --- status / work_mode -------------------------------------------------

	def test_default_excludes_done_and_cancelled(self):
		frappe.set_user(USER)
		names = {r["name"] for r in search_todos("api token")["rows"]}
		self.assertNotIn(self.done_todo.name, names)
		self.assertNotIn(self.cancelled_todo.name, names)

	def test_include_done_returns_them(self):
		frappe.set_user(USER)
		result = search_todos("api token", include_done=1, limit=100)
		names = {r["name"] for r in result["rows"]}
		self.assertIn(self.done_todo.name, names)
		self.assertIn(self.cancelled_todo.name, names)

	def test_project_and_project_detail_filters_narrow_results(self):
		frappe.set_user(USER)
		by_project = search_todos("api token", project=self.project.name, limit=100)
		self.assertGreater(by_project["total"], 0)
		by_wrong_detail = search_todos("api token", project_detail="does-not-exist")
		self.assertEqual(by_wrong_detail["rows"], [])

	def test_status_and_work_mode_filters_narrow_results(self):
		frappe.set_user(USER)
		ai_only = {r["name"] for r in search_todos("api token", work_mode="AI")["rows"]}
		self.assertIn(self.ai_todo.name, ai_only)
		self.assertNotIn(self.human_todo.name, ai_only)

	def test_assigned_to_filter_cannot_widen_visibility(self):
		"""Passing another user's email only narrows the caller's OWN visible
		set (it ANDs onto the visibility filter) -- it cannot surface a todo
		assigned to that other user in a project the caller can't see."""
		frappe.set_user(USER)
		result = search_todos("Invisible Project Secret Task", assigned_to="Administrator")
		self.assertEqual(result["rows"], [])

	# --- pagination -----------------------------------------------------------

	def test_limit_defaults_to_20_and_is_capped_at_100(self):
		frappe.set_user(USER)
		default = search_todos("api token bulk match")
		self.assertEqual(len(default["rows"]), 20)
		capped = search_todos("api token bulk match", limit=5000)
		self.assertLessEqual(len(capped["rows"]), 100)

	def test_offset_pages_without_overlap_or_gap(self):
		frappe.set_user(USER)
		page1 = search_todos("api token bulk match", limit=10, offset=0)["rows"]
		page2 = search_todos("api token bulk match", limit=10, offset=10)["rows"]
		names1 = [r["name"] for r in page1]
		names2 = [r["name"] for r in page2]
		self.assertEqual(len(set(names1) & set(names2)), 0)
		unpaged = search_todos("api token bulk match", limit=20)["rows"]
		self.assertEqual([r["name"] for r in unpaged], names1 + names2)

	def test_total_is_the_prefiltered_count_and_stable_across_pages(self):
		frappe.set_user(USER)
		p1 = search_todos("api token bulk match", limit=10, offset=0)
		p2 = search_todos("api token bulk match", limit=10, offset=10)
		self.assertEqual(p1["total"], p2["total"])
		self.assertGreater(p1["total"], len(p1["rows"]))

	def test_negative_limit_and_offset_rejected(self):
		frappe.set_user(USER)
		with self.assertRaises(frappe.ValidationError):
			search_todos("api token", limit=-1)
		with self.assertRaises(frappe.ValidationError):
			search_todos("api token", offset=-1)

	# --- shape / ordering / performance --------------------------------------

	def test_row_shape_is_the_light_field_set(self):
		frappe.set_user(USER)
		row = search_todos(self.ascii.name)["rows"][0]
		expected = {
			"name", "to_do", "status", "work_mode", "deadline", "assigned_to",
			"project_detail", "project_detail_title", "project", "project_name",
			"web_url", "mobile_url",
		}
		self.assertEqual(set(row.keys()), expected)
		self.assertEqual(row["web_url"], f"{frappe.utils.get_url().rstrip('/')}/w/project-item/{row['name']}")
		self.assertEqual(row["mobile_url"], f"{frappe.utils.get_url().rstrip('/')}/m/project-item/{row['name']}")
		self.assertNotIn("detail_todos", row)
		self.assertNotIn("team", row)
		self.assertNotIn("notes", row)

	def test_ordering_is_deterministic(self):
		frappe.set_user(USER)
		r1 = [r["name"] for r in search_todos("api token")["rows"]]
		r2 = [r["name"] for r in search_todos("api token")["rows"]]
		self.assertEqual(r1, r2)
		# exact title match ranks above a mere substring/prefix match
		self.assertEqual(r1[0], self.exact_match_title.name)

	def test_query_count_does_not_grow_with_result_count(self):
		frappe.set_user(USER)
		small = _count_queries(lambda: search_todos("api token bulk match", limit=5))
		large = _count_queries(lambda: search_todos("api token bulk match", limit=25))
		self.assertEqual(small, large, f"query count scaled with result size ({small} -> {large}) -- N+1")

	def test_method_is_whitelisted_and_listed(self):
		"""frappe.whitelist() doesn't tag the function itself -- it registers
		it in the module-level `frappe.whitelisted` list (see frappe/__init__.py).
		Checking for a non-existent attribute would silently pass regardless
		of whether the decorator ran at all."""
		self.assertIn(search_todos, frappe.whitelisted)
