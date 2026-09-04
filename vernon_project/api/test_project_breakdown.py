# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# AI-context fields on Project / Project Detail, plus the deterministic
# breakdown generator (draft subgoals + todos) and its persist step.

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate, add_days

from vernon_project.api.project import (
	generate_project_breakdown,
	persist_project_breakdown,
	_build_breakdown,
)

LEADER = "pb_leader@example.com"
STRANGER = "pb_stranger@example.com"


class TestProjectBreakdown(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		for email, name in ((LEADER, "Pb Leader"), (STRANGER, "Pb Stranger")):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": name,
					"send_welcome_email": 0, "enabled": 1,
				}).insert(ignore_permissions=True)
		if not frappe.db.exists("Has Role", {"parent": LEADER, "role": "Project Leader"}):
			frappe.get_doc("User", LEADER).add_roles("Project Leader")
		self.brand = frappe.get_all("Brand", pluck="name", limit=1)[0]
		self.group = frappe.get_all("Group", pluck="name", limit=1)[0]

		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "PB " + frappe.generate_hash(length=6),
			"brand": self.brand,
			"project_owner": "Administrator",
			"project_leader": LEADER,
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"goal": "Ship a mobile check-in feature",
			"success_condition": "Users check in under 3 seconds",
			"failure_condition": "Check-in fails or double-counts",
			"context": "Frappe v15 app, offline-tolerant",
		}).insert(ignore_permissions=True)

	# ---- fields exist & stay optional -------------------------------------

	def test_project_has_ai_context_fields(self):
		meta = frappe.get_meta("Project")
		for f in ("goal", "success_condition", "failure_condition", "context"):
			self.assertIsNotNone(meta.get_field(f), f"Project missing field {f}")

	def test_detail_has_ai_context_fields(self):
		meta = frappe.get_meta("Project Detail")
		for f in ("goal", "success_condition", "failure_condition", "context"):
			self.assertIsNotNone(meta.get_field(f), f"Project Detail missing field {f}")

	def test_old_records_without_new_fields_still_save(self):
		# A project with none of the new fields set must still validate/save.
		p = frappe.get_doc({
			"doctype": "Project",
			"project_name": "PB bare " + frappe.generate_hash(length=6),
			"brand": self.brand,
			"project_owner": "Administrator",
			"project_leader": LEADER,
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 5),
		}).insert(ignore_permissions=True)
		self.assertTrue(frappe.db.exists("Project", p.name))

	# ---- pure template ----------------------------------------------------

	def test_build_breakdown_is_deterministic_and_reflects_input(self):
		fields = {
			"goal": "Ship X", "success_condition": "Fast and correct",
			"failure_condition": "Data loss", "context": "small team",
		}
		a = _build_breakdown(fields)
		b = _build_breakdown(fields)
		self.assertEqual(a, b)                       # deterministic
		self.assertTrue(a)                           # non-empty
		for sg in a:
			self.assertTrue(sg["title"])
			self.assertTrue(sg["todos"])             # every subgoal has draft todos
		blob = frappe.as_json(a)
		self.assertIn("Fast and correct", blob)      # success text surfaced
		self.assertIn("Data loss", blob)             # failure text surfaced

	def test_build_breakdown_handles_empty_fields(self):
		# Nothing but a goal must still yield at least one subgoal with a todo.
		out = _build_breakdown({"goal": "Only a goal"})
		self.assertTrue(out)
		self.assertTrue(out[0]["todos"])

	# ---- generate (read-only) --------------------------------------------

	def test_generate_returns_drafts_and_creates_nothing(self):
		before = frappe.db.count("Project Detail", {"project": self.project.name})
		frappe.set_user(LEADER)
		res = generate_project_breakdown(self.project.name)
		self.assertIn("subgoals", res)
		self.assertTrue(res["subgoals"])
		self.assertTrue(res["subgoals"][0]["todos"])
		after = frappe.db.count("Project Detail", {"project": self.project.name})
		self.assertEqual(before, after)              # nothing persisted

	def test_generate_denied_for_stranger(self):
		frappe.set_user(STRANGER)
		with self.assertRaises(frappe.PermissionError):
			generate_project_breakdown(self.project.name)

	# ---- persist (writes) -------------------------------------------------

	def test_persist_creates_details_and_todos(self):
		frappe.set_user(LEADER)
		subgoals = [{
			"title": "Subgoal One",
			"goal": "Do the first slice",
			"success_condition": "slice works",
			"failure_condition": "slice breaks",
			"context": "ctx",
			"todos": [
				{"to_do": "First task", "work_mode": "Both",
				 "group": self.group, "level": "Backend Development"},
			],
		}]
		res = persist_project_breakdown(self.project.name, frappe.as_json(subgoals))
		self.assertEqual(res["created_todos"], 1)
		self.assertEqual(len(res["created_details"]), 1)
		detail = res["created_details"][0]
		self.assertEqual(frappe.db.get_value("Project Detail", detail, "title"), "Subgoal One")
		self.assertEqual(frappe.db.get_value("Project Detail", detail, "goal"), "Do the first slice")
		self.assertEqual(frappe.db.count("Project Todo", {"project_detail": detail}), 1)

	def test_persist_denied_for_stranger(self):
		frappe.set_user(STRANGER)
		with self.assertRaises(frappe.PermissionError):
			persist_project_breakdown(self.project.name, frappe.as_json([]))

	def test_persist_clips_overlong_context(self):
		frappe.set_user(LEADER)
		long_ctx = "x" * 10000
		subgoals = [{
			"title": "Long ctx",
			"context": long_ctx,
			"todos": [{"to_do": "t", "group": self.group, "level": "Backend Development"}],
		}]
		res = persist_project_breakdown(self.project.name, frappe.as_json(subgoals))
		stored = frappe.db.get_value("Project Detail", res["created_details"][0], "context")
		self.assertLess(len(stored), len(long_ctx))  # length-limited

	# ---- subgoal-scoped generate/persist (Project Detail screen) -----------

	def _make_detail(self):
		return frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.project.name,
			"title": "Existing subgoal",
			"project_deadline": add_days(nowdate(), 30),
			"success_condition": "subgoal succeeds cleanly",
		}).insert(ignore_permissions=True)

	def test_generate_for_detail_uses_detail_fields(self):
		detail = self._make_detail()
		frappe.set_user(LEADER)
		res = generate_project_breakdown(self.project.name, project_detail=detail.name)
		self.assertEqual(res["project_detail"], detail.name)
		self.assertTrue(res["subgoals"][0]["todos"])                     # drafts returned
		self.assertIn("subgoal succeeds cleanly", frappe.as_json(res["subgoals"]))

	def test_persist_for_detail_appends_todos_without_new_detail(self):
		detail = self._make_detail()
		before_details = frappe.db.count("Project Detail", {"project": self.project.name})
		frappe.set_user(LEADER)
		subgoals = [{
			"title": detail.title,
			"todos": [{"to_do": "Extra task", "group": self.group, "level": "Backend Development"}],
		}]
		res = persist_project_breakdown(
			self.project.name, frappe.as_json(subgoals), project_detail=detail.name
		)
		self.assertEqual(res["created_todos"], 1)
		self.assertEqual(res["created_details"], [])  # no new detail
		after_details = frappe.db.count("Project Detail", {"project": self.project.name})
		self.assertEqual(before_details, after_details)
		self.assertEqual(frappe.db.count("Project Todo", {"project_detail": detail.name}), 1)
