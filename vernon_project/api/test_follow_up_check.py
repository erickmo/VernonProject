import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.project_todo import follow_up_check

DONE = "🟠 Done"
PLANNED = "⚪️ Planned"
CHECKER = "followup-checker@test.local"


class FollowUpCheckTest(unittest.TestCase):
	"""follow_up_check: spawns a linked "(Follow Up)" todo for another team member,
	marks the source Done, and notifies the checker (whom the controller never
	notifies on its own since it only fires on status transitions)."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(
				ignore_permissions=True
			)
		if not frappe.db.exists("Group", "Test Group FU"):
			frappe.get_doc({
				"doctype": "Group", "group_name": "Test Group FU", "base_rate_per_minute": 1,
				"levels": [{"type_name": "General", "level_name": "L1",
							"level_id": "FULVL1", "difficulty_percent": 100}],
			}).insert(ignore_permissions=True)
		if not frappe.db.exists("User", CHECKER):
			frappe.get_doc({
				"doctype": "User", "email": CHECKER, "first_name": "FU Checker",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		# Project validates owner/leader carry these roles (idempotent add).
		frappe.get_doc("User", CHECKER).add_roles("Project Owner", "Project Leader")
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Follow Up Project", "brand": "Test Customer",
			# Leader/owner ≠ assignee so marking Done stops at Done (the real multi-person
			# handoff). If they were all Administrator, auto_advance self-clears both gates
			# to Completed in one save — correct, but not what this test pins.
			"project_owner": CHECKER, "project_leader": CHECKER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 90),
			"team_members": [{"user": "Administrator"}, {"user": CHECKER}],
		}).insert(ignore_permissions=True)
		self.gl = frappe.get_doc({
			"doctype": "Glossary", "glossary": "FU Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name,
			"title": "FU Detail", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 60),
		}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name,
			"to_do": "Build widget", "assigned_to": "Administrator", "start_date": nowdate(),
			"deadline": add_days(nowdate(), 7), "group": "Test Group FU", "level_id": "FULVL1",
			"estimated": 30, "status": PLANNED,
		}).insert(ignore_permissions=True)
		self.spawned = []
		frappe.db.commit()

	def test_handoff_spawns_check_todo_marks_done_and_notifies(self):
		res = follow_up_check(self.todo.name, CHECKER, note="cek grafiknya")
		self.spawned.append(res["name"])
		follow = frappe.get_doc("Project Todo", res["name"])

		# New check-todo for person 2, linked back, still Planned, "(Follow Up)" title.
		self.assertEqual(follow.assigned_to, CHECKER)
		self.assertEqual(follow.status, PLANNED)
		self.assertTrue(follow.to_do.endswith("(Follow Up)"))
		self.assertEqual(follow.notes, "cek grafiknya")
		self.assertIn(self.todo.name, [r.todo for r in follow.blocked_by])

		# Defaults: tomorrow deadline + 10 min + Engineering ▸ Backend Dev ▸ Testing (100%).
		self.assertEqual(str(follow.deadline), add_days(nowdate(), 1))
		self.assertEqual(follow.estimated, 10)
		self.assertEqual(follow.group, "Engineering")
		self.assertEqual(follow.level_id, "eng_be_testing")
		self.assertEqual(follow.level, "Testing")
		self.assertEqual(follow.level_type, "Backend Development")

		# Source marked Done for person 1.
		self.assertEqual(frappe.db.get_value("Project Todo", self.todo.name, "status"), DONE)
		self.assertEqual(res["source_status"], DONE)

		# Checker was notified about the new todo — the whole point.
		self.assertTrue(frappe.db.exists("Vernon Notification", {
			"recipient": CHECKER, "reference_name": res["name"], "type": "Assignment",
		}))

	def test_estimate_and_group_are_overridable(self):
		res = follow_up_check(self.todo.name, CHECKER, estimated=25, group="Engineering",
							  level_id="41bb5abde7", deadline=add_days(nowdate(), 3))  # Backend ▸ Feature (120%)
		self.spawned.append(res["name"])
		follow = frappe.get_doc("Project Todo", res["name"])
		self.assertEqual(follow.estimated, 25)
		self.assertEqual(follow.level_id, "41bb5abde7")
		self.assertEqual(follow.level, "Feature")
		self.assertEqual(str(follow.deadline), add_days(nowdate(), 3))

	def test_low_estimate_is_floored_to_5(self):
		res = follow_up_check(self.todo.name, CHECKER, estimated=2)
		self.spawned.append(res["name"])
		self.assertEqual(frappe.db.get_value("Project Todo", res["name"], "estimated"), 5)

	def test_non_team_assignee_is_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			follow_up_check(self.todo.name, "Guest")

	def tearDown(self):
		frappe.set_user("Administrator")
		# Delete EVERY todo in the detail (source + any spawned follow-up). Status is
		# forced Planned first so a Completed/Done row (auto-advance mints a ledger) can
		# be removed, and dependency child rows go with their parent.
		todos = frappe.get_all("Project Todo", filters={"project_detail": self.detail.name}, pluck="name")
		for name in todos:
			frappe.db.set_value("Project Todo", name, "status", PLANNED, update_modified=False)
		for name in todos:
			frappe.delete_doc("Project Todo", name, force=True, ignore_permissions=True)
		frappe.db.delete("Vernon Notification", {"recipient": CHECKER})
		for dt, name in (
			("Project Detail", self.detail.name),
			("Glossary", self.gl.name),
			("Project", self.project.name),
		):
			if frappe.db.exists(dt, name):
				frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
		frappe.db.commit()
