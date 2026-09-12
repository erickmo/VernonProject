# Copyright (c) 2026, Vernon and contributors
# See license.txt

import json
import unittest
from contextlib import contextmanager

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from vernon_project.api.project_todo import (
	get_ai_todos_needing_prompt,
	get_notes,
	list_todo_files,
	save_ai_prompt,
)
from vernon_project.fixtures_for_tests import ensure_brand, ensure_group, ensure_user
from vernon_project.tests.no_leak import NoLeakMixin


@contextmanager
def _count_queries():
	"""How many frappe.db.sql calls happen inside the block. Used to prove a query
	count stays flat as row count grows (A4) — assertQueryCount only bounds an upper
	limit, this gets the exact number back for a direct before/after comparison."""
	counts = []
	orig_sql = frappe.db.__class__.sql

	def _counted(*args, **kwargs):
		counts.append(1)
		return orig_sql(*args, **kwargs)

	frappe.db.__class__.sql = _counted
	try:
		yield counts
	finally:
		frappe.db.__class__.sql = orig_sql


class TestGetNotesAndListTodoFilesPermission(NoLeakMixin, unittest.TestCase):
	"""Regression for the 2026-09-08 permission sweep: get_notes had NO check at
	all ("accessible by all logged-in users"), and list_todo_files's docstring
	claimed a check ("a user who can open the todo can list its files") that
	didn't exist in the code. Both now gate on frappe.has_permission("Project
	Todo", "read", ...) — the same registered hook download_todo_file already
	used correctly, so this matches an existing sibling rather than inventing
	a new rule."""

	OWNER = "gnf_owner@example.com"
	ASSIGNEE = "gnf_assignee@example.com"
	OUTSIDER = "gnf_outsider@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		for email in (self.OWNER, self.ASSIGNEE, self.OUTSIDER):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", self.OWNER)
		have = {r.role for r in u.roles}
		for role in ("Project Owner", "Project Leader"):
			if role not in have:
				u.append("roles", {"role": role})
		u.save(ignore_permissions=True)
		# "Project Team" is a doctype-level role (granted broadly in real onboarding,
		# ~174 real users hold it) distinct from Project Team *membership* (the
		# per-project team_members child row) — Project Todo's has_permission hook
		# needs both: doctype-level read (this role) AND the record-level check
		# (actual membership, set on the Project below).
		# OUTSIDER also gets the role (realistic — most real users hold it) so the
		# refusal test proves the RECORD-level check (no relationship to this
		# specific project), not merely a missing doctype-level role.
		for email in (self.ASSIGNEE, self.OUTSIDER):
			u2 = frappe.get_doc("User", email)
			if not any(r.role == "Project Team" for r in u2.roles):
				u2.append("roles", {"role": "Project Team"})
				u2.save(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "GNF Test Project", "brand": "Test Customer",
			"project_owner": self.OWNER, "project_leader": self.OWNER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.ASSIGNEE}],
		}).insert(ignore_permissions=True)
		self.gl = frappe.get_doc({
			"doctype": "Glossary", "glossary": "GNF Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "GNF Detail",
			"grouping": self.gl.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		if not frappe.db.exists("Group", "Test Group"):
			frappe.get_doc({"doctype": "Group", "group_name": "Test Group"}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name,
			"to_do": "GNF task", "assigned_to": self.ASSIGNEE, "notes": "Secret notes here",
			"status": "⚪️ Planned", "start_date": nowdate(), "deadline": add_days(nowdate(), 5),
			"estimated": 30, "group": "Test Group", "level": "1",
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.db.delete("Project Todo", {"project_detail": self.detail.name})
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_owner_can_read_notes_and_files(self):
		frappe.set_user(self.OWNER)
		try:
			self.assertEqual(get_notes(self.todo.name)["notes"], "Secret notes here")
			list_todo_files(self.todo.name)  # must not raise
		finally:
			frappe.set_user("Administrator")

	def test_team_member_assignee_can_read_notes_and_files(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			self.assertEqual(get_notes(self.todo.name)["notes"], "Secret notes here")
			list_todo_files(self.todo.name)  # must not raise
		finally:
			frappe.set_user("Administrator")

	def test_outsider_refused_on_both(self):
		frappe.set_user(self.OUTSIDER)
		try:
			with self.assertRaises(frappe.PermissionError):
				get_notes(self.todo.name)
			with self.assertRaises(frappe.PermissionError):
				list_todo_files(self.todo.name)
		finally:
			frappe.set_user("Administrator")


class TestAppSettingsPrankFieldsGated(NoLeakMixin, unittest.TestCase):
	"""Regression: get_app_settings() leaked prank_target_users (spoils the gag,
	names who's targeted) and all_users (a full active-user directory) to any
	signed-in user. Both are now settings-manager-only; everything else in the
	response (branding, thresholds, banners) stays public since regular users'
	app boot depends on it — this was never gated wholesale."""

	NON_MANAGER = "asf_non_manager@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", self.NON_MANAGER):
			frappe.get_doc({
				"doctype": "User", "email": self.NON_MANAGER, "first_name": "ASF Non Manager",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
			frappe.db.commit()

	def test_non_manager_gets_empty_prank_fields_but_public_fields_intact(self):
		from vernon_project.api.mobile import get_app_settings
		frappe.set_user(self.NON_MANAGER)
		try:
			r = get_app_settings()
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(r["prank_target_users"], [])
		self.assertEqual(r["all_users"], [])
		# Public boot fields must still be present — this must not become a
		# manager-only endpoint.
		self.assertIn("app_logo", r)
		self.assertIn("min_minutes_monday", r)
		self.assertIn("home_banners", r)

	def test_system_manager_gets_real_prank_fields(self):
		from vernon_project.api.mobile import get_app_settings
		r = get_app_settings()  # already Administrator/System Manager
		self.assertIsInstance(r["all_users"], list)
		self.assertGreater(len(r["all_users"]), 0)


class TestGetAiTodosNeedingPromptPayload(NoLeakMixin, FrappeTestCase):
	"""Payload-size cut for the hourly AI-agent poll (2026-09-09): `envelope` gives
	an unambiguous empty-queue marker instead of a blank body, `include_context`
	carries the fields the caller was fetching per-todo via get_project_item, and
	`limit` caps the response. A no-argument call must still match the old shape
	exactly — that's the regression this suite is built to catch."""

	ASSIGNEE = "gatp_assignee@example.com"
	OUTSIDER = "gatp_outsider@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		ensure_brand("GATP Brand")
		ensure_user(self.ASSIGNEE, roles=("Project Team",))
		ensure_user(self.OUTSIDER, roles=("Project Team",))
		self.group = ensure_group("GATP Group", "GATPLVL1")
		self.level_id = "GATPLVL1"
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "GATP Project", "brand": "GATP Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.ASSIGNEE}, {"user": self.OUTSIDER}],
		}).insert(ignore_permissions=True)
		self.grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "GATP Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "GATP Detail",
			"grouping": self.grouping.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Project Todo", filters={"project_detail": self.detail.name}, pluck="name"):
			frappe.db.set_value("Project Todo", name, "status", "⚪️ Planned", update_modified=False)
			frappe.delete_doc("Project Todo", name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Glossary", self.grouping.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _make_todo(self, **over):
		base = dict(
			doctype="Project Todo", project_detail=self.detail.name, to_do="GATP todo",
			assigned_to=self.ASSIGNEE, start_date=nowdate(), deadline=add_days(nowdate(), 5),
			status="⚪️ Planned", work_mode="AI", group=self.group, level_id=self.level_id,
			estimated=30,
		)
		base.update(over)
		return frappe.get_doc(base).insert(ignore_permissions=True)

	def test_no_argument_call_matches_todays_shape(self):
		"""A1: bare call is unchanged — a plain list of the 7 compact keys, deadline asc."""
		early = self._make_todo(to_do="Early", deadline=add_days(nowdate(), 1))
		late = self._make_todo(to_do="Late", deadline=add_days(nowdate(), 9))
		self._make_todo(to_do="Already prompted", ai_prompt=json.dumps([{"name": "x", "prompt": "y"}]))
		self._make_todo(to_do="Human mode", work_mode="Human")
		self._make_todo(to_do="Not planned", status="🟠 Done")
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_todos_needing_prompt()
		finally:
			frappe.set_user("Administrator")
		self.assertIsInstance(result, list)
		self.assertEqual([r["name"] for r in result], [early.name, late.name])
		expected_keys = {"name", "to_do", "project", "project_detail", "status", "work_mode", "deadline"}
		for row in result:
			self.assertEqual(set(row.keys()), expected_keys)

	def test_envelope_on_empty_queue_is_not_blank(self):
		"""A2: empty queue -> ok:True, count:0, todos:[] — never a blank body."""
		frappe.set_user(self.OUTSIDER)  # has no AI todos at all
		try:
			result = get_ai_todos_needing_prompt(envelope=1)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(result["ok"], True)
		self.assertEqual(result["count"], 0)
		self.assertEqual(result["todos"], [])
		self.assertEqual(result["user"], self.OUTSIDER)
		self.assertTrue(result["server_time"])

	def test_envelope_count_matches_todos_length(self):
		self._make_todo(to_do="One")
		self._make_todo(to_do="Two")
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_todos_needing_prompt(envelope=1)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(result["count"], 2)
		self.assertEqual(result["count"], len(result["todos"]))

	def test_string_flags_behave_as_integers(self):
		"""A6: whitelisted methods receive args as strings — "0"/"1" must coerce,
		not be truthy-by-accident."""
		self._make_todo(to_do="String flag todo", notes="n")
		frappe.set_user(self.ASSIGNEE)
		try:
			off = get_ai_todos_needing_prompt(envelope="0", include_context="0")
			on = get_ai_todos_needing_prompt(envelope="1", include_context="1")
		finally:
			frappe.set_user("Administrator")
		self.assertIsInstance(off, list)
		self.assertNotIn("notes", off[0])
		self.assertIsInstance(on, dict)
		self.assertTrue(on["ok"])
		self.assertIn("notes", on["todos"][0])

	def test_include_context_adds_exactly_the_listed_keys(self):
		"""A3 snapshot: include_context=1 adds notes, project_detail_title, level_type,
		group, estimated, creator, is_follow_up, issue_of, issue_of_title, blocked_by,
		blocking — nothing else (no team, avatars, detail_todos, timeline)."""
		host = self._make_todo(to_do="Host issue target", work_mode="Human")
		blocker = self._make_todo(to_do="Blocker todo", work_mode="Human")
		main = self._make_todo(
			to_do="Main AI todo", notes="Some notes", is_follow_up=1,
			issue_of=host.name, blocked_by=[{"todo": blocker.name}],
		)
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_todos_needing_prompt(include_context=1)
		finally:
			frappe.set_user("Administrator")
		row = next(r for r in result if r["name"] == main.name)
		expected_keys = {
			"name", "to_do", "project", "project_detail", "status", "work_mode", "deadline",
			"notes", "project_detail_title", "level_type", "group", "estimated", "creator",
			"is_follow_up", "issue_of", "issue_of_title", "blocked_by", "blocking",
		}
		self.assertEqual(set(row.keys()), expected_keys)
		self.assertEqual(row["notes"], "Some notes")
		self.assertEqual(row["project_detail_title"], "GATP Detail")
		self.assertEqual(row["level_type"], "General")
		self.assertEqual(row["group"], self.group)
		self.assertEqual(row["estimated"], 30)
		self.assertEqual(row["creator"], "Administrator")
		self.assertEqual(row["is_follow_up"], True)
		self.assertEqual(row["issue_of"], host.name)
		self.assertEqual(row["issue_of_title"], "Host issue target")
		self.assertEqual(row["blocked_by"], [blocker.name])
		self.assertEqual(row["blocking"], [])

	def test_include_context_query_count_does_not_grow_with_rows(self):
		"""A4: the same number of queries whether there are 5 or 50 matching rows."""
		for i in range(5):
			self._make_todo(to_do=f"Small batch {i}", notes=f"note {i}")
		frappe.set_user(self.ASSIGNEE)
		try:
			with _count_queries() as small:
				get_ai_todos_needing_prompt(include_context=1)
		finally:
			frappe.set_user("Administrator")
		for i in range(45):
			self._make_todo(to_do=f"Large batch {i}", notes=f"note {i}")
		frappe.set_user(self.ASSIGNEE)
		try:
			with _count_queries() as large:
				get_ai_todos_needing_prompt(include_context=1)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(len(small), len(large))

	def test_limit_caps_rows(self):
		early = self._make_todo(to_do="A", deadline=add_days(nowdate(), 1))
		self._make_todo(to_do="B", deadline=add_days(nowdate(), 2))
		self._make_todo(to_do="C", deadline=add_days(nowdate(), 3))
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_todos_needing_prompt(limit=1)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(len(result), 1)
		self.assertEqual(result[0]["name"], early.name)

	def test_limit_as_string_is_coerced(self):
		self._make_todo(to_do="A")
		self._make_todo(to_do="B")
		frappe.set_user(self.ASSIGNEE)
		try:
			result = get_ai_todos_needing_prompt(limit="1")
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(len(result), 1)

	def test_outsider_never_sees_assignees_queue(self):
		"""Scoping is unchanged by the new flags: still strictly assigned_to == caller."""
		self._make_todo(to_do="Assignee-only todo", notes="secret")
		frappe.set_user(self.OUTSIDER)
		try:
			plain = get_ai_todos_needing_prompt()
			enveloped = get_ai_todos_needing_prompt(envelope=1, include_context=1)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(plain, [])
		self.assertEqual(enveloped["count"], 0)
		self.assertEqual(enveloped["todos"], [])


class TestSaveAiPromptReturnPrompts(NoLeakMixin, FrappeTestCase):
	"""save_ai_prompt(return_prompts=0) drops the ~20 KB prompt-body echo — count
	and names confirm the write just as well as the full body did."""

	ASSIGNEE = "sarp_assignee@example.com"
	OUTSIDER = "sarp_outsider@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		ensure_brand("SARP Brand")
		ensure_user(self.ASSIGNEE, roles=("Project Team",))
		ensure_user(self.OUTSIDER, roles=("Project Team",))
		self.group = ensure_group("SARP Group", "SARPLVL1")
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "SARP Project", "brand": "SARP Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.ASSIGNEE}, {"user": self.OUTSIDER}],
		}).insert(ignore_permissions=True)
		self.grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "SARP Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "SARP Detail",
			"grouping": self.grouping.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name, "to_do": "SARP todo",
			"assigned_to": self.ASSIGNEE, "start_date": nowdate(), "deadline": add_days(nowdate(), 5),
			"status": "⚪️ Planned", "work_mode": "AI", "group": self.group, "level_id": "SARPLVL1",
			"estimated": 30,
		}).insert(ignore_permissions=True)
		frappe.db.commit()
		self.prompts_json = json.dumps([
			{"name": "step1", "prompt": "Do X"},
			{"name": "step2", "prompt": "Do Y"},
			{"name": "step3", "prompt": "Do Z"},
		])

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.delete_doc("Project Todo", self.todo.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Glossary", self.grouping.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_default_call_matches_todays_shape(self):
		"""A1: no return_prompts arg -> unchanged full echo + ai_phase, nothing new."""
		result = save_ai_prompt(self.todo.name, self.prompts_json)
		self.assertEqual(set(result.keys()), {"status", "message", "ai_prompts", "ai_phase"})
		self.assertEqual(len(result["ai_prompts"]), 3)

	def test_return_prompts_zero_gives_count_and_names_no_bodies(self):
		"""A5: count 3 + the 3 names, no prompt bodies."""
		result = save_ai_prompt(self.todo.name, self.prompts_json, return_prompts=0)
		self.assertEqual(result["status"], "ok")
		self.assertEqual(result["count"], 3)
		self.assertEqual(result["names"], ["step1", "step2", "step3"])
		self.assertNotIn("ai_prompts", result)
		self.assertNotIn("ai_phase", result)

	def test_storage_is_identical_regardless_of_return_prompts(self):
		save_ai_prompt(self.todo.name, self.prompts_json, return_prompts=0)
		self.todo.reload()
		stored = self.todo.ai_prompt
		other = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name, "to_do": "SARP todo 2",
			"assigned_to": self.ASSIGNEE, "start_date": nowdate(), "deadline": add_days(nowdate(), 5),
			"status": "⚪️ Planned", "work_mode": "AI", "group": self.group, "level_id": "SARPLVL1",
			"estimated": 30,
		}).insert(ignore_permissions=True)
		try:
			save_ai_prompt(other.name, self.prompts_json, return_prompts=1)
			other.reload()
			self.assertEqual(json.loads(stored), json.loads(other.ai_prompt))
		finally:
			frappe.delete_doc("Project Todo", other.name, force=True, ignore_permissions=True)

	def test_return_prompts_string_flag_is_coerced(self):
		off = save_ai_prompt(self.todo.name, self.prompts_json, return_prompts="0")
		self.assertNotIn("ai_prompts", off)
		self.todo.reload()
		on = save_ai_prompt(self.todo.name, self.prompts_json, return_prompts="1")
		self.assertIn("ai_prompts", on)

	def test_permission_gate_unaffected_by_return_prompts_flag(self):
		frappe.set_user(self.OUTSIDER)
		try:
			refused_full = save_ai_prompt(self.todo.name, self.prompts_json)
			refused_lean = save_ai_prompt(self.todo.name, self.prompts_json, return_prompts=0)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(refused_full["status"], "error")
		self.assertEqual(refused_lean["status"], "error")
