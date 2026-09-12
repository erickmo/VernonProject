# Copyright (c) 2026, Vernon and contributors
# See license.txt

"""Part 2 of the AI-agent payload-size cut (2026-09-09): two new lean read
endpoints replacing get_project_item / get_project for an agent writing an
AI prompt. See vernon_project/api/test_project_todo_api.py for part 1
(get_ai_todos_needing_prompt / save_ai_prompt) and its query-count helper."""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from vernon_project.api.project_todo import get_ai_project_context, get_ai_todo_context
from vernon_project.api.test_project_todo_api import _count_queries
from vernon_project.fixtures_for_tests import ensure_brand, ensure_group, ensure_user
from vernon_project.tests.no_leak import NoLeakMixin


class TestGetAiTodoContext(NoLeakMixin, FrappeTestCase):
	"""Lean replacement for get_project_item when writing an AI prompt."""

	ASSIGNEE = "gatc_assignee@example.com"
	OUTSIDER = "gatc_outsider@example.com"

	EXPECTED_KEYS = {
		"name", "to_do", "status", "work_mode", "ai_phase", "ai_prompts_count",
		"deadline", "estimated", "group", "level_type", "creator", "assigned_to",
		"project", "project_name", "brand", "project_detail", "project_detail_title",
		"notes", "is_follow_up", "issue_of", "issue_of_title", "issue_of_notes",
		"blocked_by", "blocking", "sibling_detail_titles",
	}

	def setUp(self):
		frappe.set_user("Administrator")
		ensure_brand("GATC Brand")
		ensure_user(self.ASSIGNEE, roles=("Project Team",))
		ensure_user(self.OUTSIDER, roles=("Project Team",))
		self.group = ensure_group("GATC Group", "GATCLVL1")
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "GATC Project", "brand": "GATC Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"goal": "Ship the thing", "context": "Some context",
			"success_condition": "It ships", "failure_condition": "It doesn't",
			"team_members": [{"user": self.ASSIGNEE}],
		}).insert(ignore_permissions=True)
		self.grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "GATC Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.main_detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "GATC Main Detail",
			"grouping": self.grouping.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		self.sib1 = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Sibling One",
			"grouping": self.grouping.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		self.sib2 = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Sibling One",
			"grouping": self.grouping.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)

		self.host = self._make_todo(to_do="Host issue target", notes="Host notes text", work_mode="Human")
		self.blocker_a = self._make_todo(to_do="Blocker A", work_mode="Human")
		self.blocker_b = self._make_todo(to_do="Blocker B", work_mode="Human")
		self.main = self._make_todo(
			to_do="Main AI todo", notes="Main notes", is_follow_up=1,
			issue_of=self.host.name,
			blocked_by=[{"todo": self.blocker_a.name}, {"todo": self.blocker_b.name}],
		)
		self.downstream = self._make_todo(
			to_do="Downstream", work_mode="Human", blocked_by=[{"todo": self.main.name}],
		)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for detail in (self.main_detail.name, self.sib1.name, self.sib2.name):
			for name in frappe.get_all("Project Todo", filters={"project_detail": detail}, pluck="name"):
				frappe.db.set_value("Project Todo", name, "status", "⚪️ Planned", update_modified=False)
				frappe.delete_doc("Project Todo", name, force=True, ignore_permissions=True)
			frappe.delete_doc("Project Detail", detail, force=True, ignore_permissions=True)
		frappe.delete_doc("Glossary", self.grouping.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _make_todo(self, **over):
		base = dict(
			doctype="Project Todo", project_detail=self.main_detail.name, to_do="GATC todo",
			assigned_to=self.ASSIGNEE, start_date=nowdate(), deadline=add_days(nowdate(), 5),
			status="⚪️ Planned", work_mode="AI", group=self.group, level_id="GATCLVL1",
			estimated=30,
		)
		base.update(over)
		return frappe.get_doc(base).insert(ignore_permissions=True)

	def test_unknown_id_raises_does_not_exist(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			with self.assertRaises(frappe.DoesNotExistError):
				get_ai_todo_context("NOPE-DOES-NOT-EXIST")
		finally:
			frappe.set_user("Administrator")

	def test_outsider_raises_permission_error(self):
		"""A3 + scoping proof: a real todo, but the caller has no relationship to it."""
		frappe.set_user(self.OUTSIDER)
		try:
			with self.assertRaises(frappe.PermissionError):
				get_ai_todo_context(self.main.name)
		finally:
			frappe.set_user("Administrator")

	def test_returns_exactly_the_listed_keys(self):
		"""A1 snapshot: pins the exact key set so the payload can't silently re-inflate."""
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_todo_context(self.main.name)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(set(result.keys()), self.EXPECTED_KEYS)

	def test_content_is_correct(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_todo_context(self.main.name)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(result["name"], self.main.name)
		self.assertEqual(result["to_do"], "Main AI todo")
		self.assertEqual(result["status"], "⚪️ Planned")
		self.assertEqual(result["work_mode"], "AI")
		self.assertEqual(result["notes"], "Main notes")
		self.assertEqual(result["is_follow_up"], True)
		self.assertEqual(result["assigned_to"], self.ASSIGNEE)
		self.assertEqual(result["creator"], "Administrator")
		self.assertEqual(result["project"], self.project.name)
		self.assertEqual(result["project_name"], "GATC Project")
		self.assertEqual(result["brand"], "GATC Brand")
		self.assertEqual(result["project_detail"], self.main_detail.name)
		self.assertEqual(result["project_detail_title"], "GATC Main Detail")
		self.assertEqual(result["group"], self.group)
		self.assertEqual(result["level_type"], "General")
		self.assertEqual(result["estimated"], 30)
		self.assertIsInstance(result["ai_phase"], int)

	def test_ai_prompts_count_is_an_integer_never_the_text(self):
		"""A2: ai_prompts_count is an int; the prompt text itself never appears."""
		import json
		self.main.reload()  # downstream's blocked_by mirrored a save onto main after setUp
		self.main.ai_prompt = json.dumps([
			{"name": "step1", "prompt": "SECRET PROMPT BODY ONE"},
			{"name": "step2", "prompt": "SECRET PROMPT BODY TWO"},
		])
		self.main.save(ignore_permissions=True)
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_todo_context(self.main.name)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(result["ai_prompts_count"], 2)
		self.assertIsInstance(result["ai_prompts_count"], int)
		dumped = str(result)
		self.assertNotIn("SECRET PROMPT BODY", dumped)
		for forbidden in ("ai_prompts", "team", "avatars", "detail_todos", "timeline", "allocations"):
			self.assertNotIn(forbidden, result)

	def test_sibling_detail_titles_deduped_and_excludes_self(self):
		"""A4: the project's OTHER sub-module titles, deduplicated, as plain strings."""
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_todo_context(self.main.name)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(sorted(result["sibling_detail_titles"]), ["Sibling One"])
		self.assertNotIn("GATC Main Detail", result["sibling_detail_titles"])
		for title in result["sibling_detail_titles"]:
			self.assertIsInstance(title, str)

	def test_issue_of_title_and_notes_populated_when_set(self):
		"""A5: populated when issue_of is set..."""
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_todo_context(self.main.name)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(result["issue_of"], self.host.name)
		self.assertEqual(result["issue_of_title"], "Host issue target")
		self.assertEqual(result["issue_of_notes"], "Host notes text")

	def test_issue_of_title_and_notes_null_when_not_set(self):
		"""A5: ...null when not."""
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_todo_context(self.host.name)
		finally:
			frappe.set_user("Administrator")
		self.assertIsNone(result["issue_of"])
		self.assertIsNone(result["issue_of_title"])
		self.assertIsNone(result["issue_of_notes"])

	def test_blocked_by_and_blocking_carry_name_and_title(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_todo_context(self.main.name)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(
			{(b["name"], b["to_do"]) for b in result["blocked_by"]},
			{(self.blocker_a.name, "Blocker A"), (self.blocker_b.name, "Blocker B")},
		)
		self.assertEqual(
			{(b["name"], b["to_do"]) for b in result["blocking"]},
			{(self.downstream.name, "Downstream")},
		)

	def test_query_count_does_not_grow_with_link_count(self):
		"""A6: no per-field / per-link lookups — a todo with many blocked_by links
		costs the same number of queries as one with few."""
		few_blocker = self._make_todo(to_do="Few blocker", work_mode="Human")
		todo_few = self._make_todo(
			to_do="Few links", issue_of=self.host.name, blocked_by=[{"todo": few_blocker.name}],
		)
		many_blockers = [self._make_todo(to_do=f"Many blocker {i}", work_mode="Human") for i in range(10)]
		todo_many = self._make_todo(
			to_do="Many links", issue_of=self.host.name,
			blocked_by=[{"todo": b.name} for b in many_blockers],
		)
		frappe.set_user(self.ASSIGNEE)
		try:
			with _count_queries() as few:
				get_ai_todo_context(todo_few.name)
			with _count_queries() as many:
				get_ai_todo_context(todo_many.name)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(len(few), len(many))


class TestGetAiProjectContext(NoLeakMixin, FrappeTestCase):
	"""Lean replacement for get_project when writing an AI prompt."""

	ASSIGNEE = "gapc_assignee@example.com"
	OUTSIDER = "gapc_outsider@example.com"

	EXPECTED_KEYS = {
		"name", "project_name", "brand", "goal", "context", "success_condition",
		"failure_condition", "groupings", "project_details",
	}

	def setUp(self):
		frappe.set_user("Administrator")
		ensure_brand("GAPC Brand")
		ensure_user(self.ASSIGNEE, roles=("Project Team",))
		ensure_user(self.OUTSIDER, roles=("Project Team",))
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "GAPC Project", "brand": "GAPC Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"goal": "Ship the thing", "context": "Some context",
			"success_condition": "It ships", "failure_condition": "It doesn't",
			"team_members": [{"user": self.ASSIGNEE}],
		}).insert(ignore_permissions=True)
		self.grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "GAPC Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail_a = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "GAPC Detail A",
			"grouping": self.grouping.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		self.detail_b = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "GAPC Detail B",
			"grouping": self.grouping.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.delete_doc("Project Detail", self.detail_a.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project Detail", self.detail_b.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Glossary", self.grouping.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_unknown_project_raises_does_not_exist(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			with self.assertRaises(frappe.DoesNotExistError):
				get_ai_project_context("NOPE-DOES-NOT-EXIST")
		finally:
			frappe.set_user("Administrator")

	def test_outsider_raises_permission_error(self):
		frappe.set_user(self.OUTSIDER)
		try:
			with self.assertRaises(frappe.PermissionError):
				get_ai_project_context(self.project.name)
		finally:
			frappe.set_user("Administrator")

	def test_returns_exactly_the_listed_keys(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_project_context(self.project.name)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(set(result.keys()), self.EXPECTED_KEYS)

	def test_content_is_correct(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_project_context(self.project.name)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(result["name"], self.project.name)
		self.assertEqual(result["project_name"], "GAPC Project")
		self.assertEqual(result["brand"], "GAPC Brand")
		self.assertEqual(result["goal"], "Ship the thing")
		self.assertEqual(result["context"], "Some context")
		self.assertEqual(result["success_condition"], "It ships")
		self.assertEqual(result["failure_condition"], "It doesn't")
		self.assertIn("GAPC Grouping", result["groupings"])
		self.assertEqual(
			{(d["name"], d["title"]) for d in result["project_details"]},
			{(self.detail_a.name, "GAPC Detail A"), (self.detail_b.name, "GAPC Detail B")},
		)
