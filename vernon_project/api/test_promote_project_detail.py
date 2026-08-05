# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# promote_project_detail = create a Project named after a Project Detail
# (owner/leader/admins copied, starting today for the source project's span),
# then MOVE the detail and its todos into it.

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.api.mobile import promote_project_detail

LEADER = "pp_leader@example.com"
ADMIN = "pp_admin@example.com"
MEMBER = "pp_member@example.com"
STRANGER = "pp_stranger@example.com"
USERS = (
	(LEADER, "Pp Leader"), (ADMIN, "Pp Admin"), (MEMBER, "Pp Member"), (STRANGER, "Pp Stranger"),
)


class TestPromoteProjectDetail(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		for email, name in USERS:
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": name,
					"send_welcome_email": 0, "enabled": 1,
				}).insert(ignore_permissions=True)
		if not frappe.db.exists("Has Role", {"parent": LEADER, "role": "Project Leader"}):
			frappe.get_doc("User", LEADER).add_roles("Project Leader")
		self.brand = frappe.get_all("Brand", pluck="name", limit=1)[0]

		self.title = "PP Detail " + frappe.generate_hash(length=6)
		self.pname = "PP Source " + frappe.generate_hash(length=6)
		self.src = frappe.get_doc({
			"doctype": "Project",
			"project_name": self.pname,
			"brand": self.brand,
			"project_owner": "Administrator",
			"project_leader": LEADER,
			"status": "Ongoing",
			# started 10 days ago, 30-day span -> the promoted project runs
			# today .. today+30, NOT the leftover 20 days.
			"start_date": add_days(nowdate(), -10),
			"deadline": add_days(nowdate(), 20),
			"project_admins": [{"user": ADMIN}],
			"team_members": [{"user": MEMBER}],
		}).insert(ignore_permissions=True)

		self.detail = frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.src.name,
			"title": self.title,
			"project_deadline": add_days(nowdate(), 20),
			"latest_deadline": add_days(nowdate(), 10),
		}).insert(ignore_permissions=True)

		# A todo assigned to a plain team member: must follow the detail into the
		# new project, and MEMBER must be seeded onto the new team so the todo
		# stays valid there.
		todo = frappe.get_doc({
			"doctype": "Project Todo",
			"project": self.src.name,
			"project_detail": self.detail.name,
			"to_do": "a task",
			"assigned_to": MEMBER,
			"status": "⚪️ Planned",
		})
		todo.flags.ignore_validate = True
		todo.insert(ignore_permissions=True, ignore_mandatory=True)
		self.todo = todo.name
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		names = frappe.get_all(
			"Project", filters={"project_name": ["in", [self.pname, self.title]]}, pluck="name"
		)
		for pn in names:
			frappe.db.delete("Project Todo", {"project": pn})
			frappe.db.delete("Project Detail", {"project": pn})
		for pn in names:
			frappe.delete_doc("Project", pn, ignore_permissions=True, force=1)
		for email, _ in USERS:
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, ignore_permissions=True, force=1)
		frappe.db.commit()

	def test_promotes_and_moves_detail(self):
		res = promote_project_detail(self.detail.name)  # as Administrator (owner)
		new = frappe.get_doc("Project", res["name"])

		self.assertEqual(new.project_name, self.title)  # same name as the detail
		self.assertEqual(new.project_owner, self.src.project_owner)
		self.assertEqual(new.project_leader, self.src.project_leader)
		self.assertEqual(new.brand, self.src.brand)
		self.assertEqual([a.user for a in new.project_admins], [ADMIN])
		self.assertEqual(new.status, "Ongoing")

		# starts today, keeps the source project's 30-day span
		self.assertEqual(str(new.start_date), nowdate())
		self.assertEqual(str(new.deadline), add_days(nowdate(), 30))

		# the detail moved, taking its todo (and the todo's assignee onto the team)
		self.assertEqual(res["moved_todos"], 1)
		self.assertEqual(frappe.db.get_value("Project Detail", self.detail.name, "project"), new.name)
		self.assertEqual(frappe.db.get_value("Project Todo", self.todo, "project"), new.name)
		self.assertIn(MEMBER, {m.user for m in new.team_members})
		self.assertEqual(frappe.db.count("Project Detail", {"project": self.src.name}), 0)

	def test_denied_for_stranger(self):
		frappe.set_user(STRANGER)
		with self.assertRaises(frappe.PermissionError):
			promote_project_detail(self.detail.name)
