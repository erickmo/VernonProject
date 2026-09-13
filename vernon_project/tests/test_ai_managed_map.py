# Copyright (c) 2026, Vernon and contributors
"""v9oli6m7hj: which projects and sub-goals an AI session is responsible for.

The Project / Project Detail AI-management fields already exist and are already
editable in both frontends. What was missing is a way for an MCP client to FIND
them: `is_ai_managed` was readable only through get_project / get_project_detail,
i.e. only if you already knew the name. This is the discovery endpoint, and the
MCP client reaches it through the connector's existing list_api_methods scan --
no protocol, schema or capability change.
"""

import unittest

import frappe

from vernon_project.fixtures_for_tests import ensure_brand, ensure_user
from vernon_project.tests.no_leak import NoLeakMixin

TITLE = "ZZ ai-map probe"
OUTSIDER = "zz-ai-map-outsider@example.com"


class TestAiManagedMap(NoLeakMixin, unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		frappe.set_user("Administrator")
		if not frappe.db.has_column("Project", "is_ai_managed"):
			raise unittest.SkipTest("doctype reload has not run yet on this site")

	def setUp(self):
		frappe.set_user("Administrator")
		ensure_brand("Test Customer")
		# A real, ordinary app user: has Project Team so Project read is permitted at
		# all, and simply is not on THIS project. A role-less account would make the
		# endpoint throw on the permission check and prove nothing about scoping.
		ensure_user(OUTSIDER, first_name="ZZ Outsider", roles=("Project Team",))

	def _project(self, managed=True, device="box-1", session="worker-a"):
		doc = frappe.get_doc({
			"doctype": "Project", "project_name": f"{TITLE} {frappe.generate_hash(length=6)}",
			"brand": "Test Customer", "project_owner": "Administrator",
			"project_leader": "Administrator", "status": "Ongoing",
			"start_date": frappe.utils.nowdate(),
			"deadline": frappe.utils.add_days(frappe.utils.nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		})
		if managed:
			doc.is_ai_managed = 1
			doc.ai_device = device
			doc.ai_session_name = session
		return doc.insert(ignore_permissions=True)

	def _detail(self, project, managed=True, device="box-2", session="worker-b"):
		doc = frappe.get_doc({
			"doctype": "Project Detail", "title": f"{TITLE} detail",
			"project": project.name, "project_deadline": project.deadline,
		})
		if managed:
			doc.is_ai_managed = 1
			doc.ai_device = device
			doc.ai_session_name = session
		return doc.insert(ignore_permissions=True)

	# --- what it returns ----------------------------------------------------------
	def test_lists_an_ai_managed_project_with_its_device_and_session(self):
		from vernon_project.api.project import get_ai_managed

		p = self._project(device="box-9", session="worker-z")
		row = next((r for r in get_ai_managed()["projects"] if r["name"] == p.name), None)
		self.assertIsNotNone(row, "an AI-managed project is missing from the map")
		self.assertEqual(row["ai_device"], "box-9")
		self.assertEqual(row["ai_session_name"], "worker-z")

	def test_omits_a_project_that_is_not_ai_managed(self):
		from vernon_project.api.project import get_ai_managed

		p = self._project(managed=False)
		names = [r["name"] for r in get_ai_managed()["projects"]]
		self.assertNotIn(p.name, names)

	def test_lists_an_ai_managed_detail_and_names_its_parent(self):
		from vernon_project.api.project import get_ai_managed

		p = self._project(managed=False)
		d = self._detail(p, device="box-3", session="worker-c")
		row = next((r for r in get_ai_managed()["details"] if r["name"] == d.name), None)
		self.assertIsNotNone(row, "an AI-managed sub-goal is missing from the map")
		self.assertEqual(row["project"], p.name)
		self.assertEqual(row["ai_device"], "box-3")

	def test_a_detail_is_independent_of_its_project(self):
		"""Criterion 2: the two tags are configured separately, so an unmanaged
		project can hold a managed sub-goal and must not be inferred as managed."""
		from vernon_project.api.project import get_ai_managed

		p = self._project(managed=False)
		self._detail(p)
		out = get_ai_managed()
		self.assertNotIn(p.name, [r["name"] for r in out["projects"]])

	# --- who may see it -----------------------------------------------------------
	def test_a_user_not_involved_does_not_see_the_mapping(self):
		"""Scoped through _visible_projects, the same helper the dashboards use --
		not a bare get_all, which would expose every project's device and session."""
		from vernon_project.api.project import get_ai_managed

		p = self._project()
		d = self._detail(p)
		frappe.set_user(OUTSIDER)
		try:
			out = get_ai_managed()
		finally:
			frappe.set_user("Administrator")
		self.assertNotIn(p.name, [r["name"] for r in out["projects"]])
		self.assertNotIn(d.name, [r["name"] for r in out["details"]])

	# --- orthogonality --------------------------------------------------------------
	def test_it_says_nothing_about_a_todo_s_own_ai_tag(self):
		"""The scope guard: project-level AI management and the todo AI ladder are
		different things. The payload must not carry work_mode / ai_phase / prompt."""
		from vernon_project.api.project import get_ai_managed

		self._project()
		out = get_ai_managed()
		leaked = {"work_mode", "ai_phase", "ai_prompt", "ai_prompt_confirmed", "ai_in_progress"}
		for bucket in out.values():
			for row in bucket:
				self.assertFalse(leaked & set(row), f"todo AI fields leaked into the map: {row}")

	# --- cost ------------------------------------------------------------------------
	def test_query_count_does_not_grow_with_the_number_of_mappings(self):
		"""Two rows vs six must cost the same queries, or the map is an N+1 waiting
		for the board to fill up."""
		from vernon_project.api.project import get_ai_managed

		def count_for(n):
			for _ in range(n):
				self._project()
			# Warm the role / permission caches first: the FIRST call of the process
			# costs extra queries that have nothing to do with how many mappings
			# exist, and counting those made the smaller case look more expensive.
			get_ai_managed()
			calls = []
			real = frappe.db.sql
			frappe.db.sql = lambda *a, **kw: (calls.append(1), real(*a, **kw))[1]
			try:
				get_ai_managed()
			finally:
				frappe.db.sql = real
			return len(calls)

		self.assertEqual(count_for(2), count_for(4))
