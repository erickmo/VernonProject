# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""152j8iaa6j — get_confirmed_ai_todos(lean=1).

The queue is polled on a loop by an autonomous orchestrator that only needs
enough to CHOOSE a todo; it then fetches the one it picked with
get_ai_todo_context. Carrying every prompt body on the hot path is pure waste.

The default response must not move a byte — that is the first thing these tests
check, because every existing caller depends on it.
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from vernon_project.api.project_todo import get_confirmed_ai_todos
from vernon_project.api.test_project_todo_api import _count_queries
from vernon_project.fixtures_for_tests import ensure_brand, ensure_group, ensure_user

PROMPTS = [
	{"name": "Build", "prompt": "x" * 4000},
	{"name": "Backend tests", "prompt": "y" * 4000},
]
DEFAULT_KEYS = {"name", "to_do", "project", "project_detail", "status", "work_mode", "deadline", "ai_prompts"}
LEAN_KEYS = {
	"name", "to_do", "project", "project_name", "project_detail", "project_detail_title",
	"status", "work_mode", "deadline", "group", "level_type", "ai_phase", "ai_prompts_count",
}


class TestLeanAiQueue(FrappeTestCase):
	AGENT = "lean_queue_agent@example.com"
	OTHER = "lean_queue_other@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		ensure_brand("Lean Queue Brand")
		ensure_user(self.AGENT, roles=("Project Team",))
		ensure_user(self.OTHER, roles=("Project Team",))
		self.group = ensure_group("Lean Queue Group", "LEANLVL1")
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Lean Queue Project", "brand": "Lean Queue Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.AGENT}, {"user": self.OTHER}],
		}).insert(ignore_permissions=True)
		self.grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "Lean Queue Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Lean Queue Detail",
			"grouping": self.grouping.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		self.todos = [self._make(i) for i in range(3)]

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Project Todo", filters={"project_detail": self.detail.name}, pluck="name"):
			frappe.db.set_value("Project Todo", name, "status", "⚪️ Planned", update_modified=False)
			frappe.delete_doc("Project Todo", name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Glossary", self.grouping.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)

	def _make(self, i, **over):
		base = dict(
			doctype="Project Todo", project_detail=self.detail.name, to_do="Lean todo %d" % i,
			assigned_to=self.AGENT, start_date=nowdate(), deadline=add_days(nowdate(), i + 1),
			status="⚪️ Planned", work_mode="AI", group=self.group, level_id="LEANLVL1",
			estimated=30, ai_prompt=json.dumps(PROMPTS), ai_prompt_confirmed=1,
		)
		base.update(over)
		return frappe.get_doc(base).insert(ignore_permissions=True)

	def _as_agent(self, **kwargs):
		frappe.set_user(self.AGENT)
		try:
			return get_confirmed_ai_todos(**kwargs)
		finally:
			frappe.set_user("Administrator")

	# --- the default must not move ------------------------------------------

	def test_the_default_response_is_exactly_what_it_always_was(self):
		rows = self._as_agent()
		self.assertTrue(rows)
		for row in rows:
			self.assertEqual(set(row), DEFAULT_KEYS)
			self.assertEqual(row["ai_prompts"], PROMPTS)

	def test_lean_zero_as_a_string_is_still_the_default(self):
		"""Every argument arrives as a string over HTTP, so "0" must read as falsy."""
		self.assertEqual(set(self._as_agent(lean="0")[0]), DEFAULT_KEYS)
		self.assertEqual(set(self._as_agent(lean=0)[0]), DEFAULT_KEYS)
		self.assertEqual(set(self._as_agent(lean="")[0]), DEFAULT_KEYS)

	# --- lean ----------------------------------------------------------------

	def test_lean_one_as_a_string_works_too(self):
		self.assertEqual(set(self._as_agent(lean="1")[0]), LEAN_KEYS)

	def test_lean_returns_the_same_todos_in_the_same_order(self):
		self.assertEqual(
			[r["name"] for r in self._as_agent(lean=1)],
			[r["name"] for r in self._as_agent()],
		)

	def test_lean_carries_the_projection_and_no_prompt_bodies(self):
		for row in self._as_agent(lean=1):
			self.assertEqual(set(row), LEAN_KEYS)
			self.assertNotIn("ai_prompts", row)
			self.assertEqual(row["ai_prompts_count"], len(PROMPTS))
			self.assertEqual(row["project_name"], "Lean Queue Project")
			self.assertEqual(row["project_detail_title"], "Lean Queue Detail")
			self.assertEqual(row["ai_phase"], 3)
			self.assertEqual(row["group"], self.group)

	def test_lean_is_dramatically_smaller(self):
		full = len(json.dumps(self._as_agent(), default=str))
		lean = len(json.dumps(self._as_agent(lean=1), default=str))
		self.assertLess(lean, full / 5, "lean saved almost nothing: %d vs %d bytes" % (lean, full))

	def test_a_prompt_emptied_out_of_band_is_skipped_in_both_modes(self):
		orphan = self._make(99, ai_prompt="[]")
		for kwargs in ({}, {"lean": 1}):
			names = [r["name"] for r in self._as_agent(**kwargs)]
			self.assertNotIn(orphan.name, names)

	def test_lean_does_not_widen_who_can_see_what(self):
		mine = {r["name"] for r in self._as_agent(lean=1)}
		frappe.set_user(self.OTHER)
		try:
			theirs = {r["name"] for r in get_confirmed_ai_todos(lean=1)}
		finally:
			frappe.set_user("Administrator")
		self.assertTrue(mine)
		self.assertFalse(mine & theirs)

	def test_query_count_does_not_grow_with_the_number_of_todos(self):
		"""Two sizes, not one: a single board size cannot tell a constant number of
		queries apart from one query per todo."""
		with _count_queries() as few:
			self._as_agent(lean=1)
		for i in range(10, 20):
			self._make(i)
		with _count_queries() as many:
			rows = self._as_agent(lean=1)
		self.assertGreater(len(rows), 10)
		self.assertEqual(len(few), len(many))
