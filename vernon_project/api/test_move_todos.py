# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# move_todos = reparent one or more Project Todos into another Project Detail of
# the SAME project. Guard mirrors update_todo (SM / owner / leader / assignee).
# Two-pass: a single bad todo aborts the batch with nothing moved.

import frappe
import unittest
from vernon_project.api.mobile import move_todos

OWNER = "mt_owner@example.com"
MEMBER = "mt_member@example.com"
STRANGER = "mt_stranger@example.com"
USERS = ((OWNER, "Mt Owner"), (MEMBER, "Mt Member"), (STRANGER, "Mt Stranger"))


class TestMoveTodos(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		for email, name in USERS:
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": name,
					"send_welcome_email": 0, "enabled": 1,
				}).insert(ignore_permissions=True)
		frappe.get_doc("User", OWNER).add_roles("Project Owner", "Project Leader")
		self.brand = frappe.get_all("Brand", pluck="name", limit=1)[0]
		self.tag = frappe.generate_hash(length=6)

		self.proj = self._project("MT Proj " + self.tag, OWNER)
		self.other = self._project("MT Other " + self.tag, OWNER)
		self.a = self._detail(self.proj, "A " + self.tag)
		self.b = self._detail(self.proj, "B " + self.tag)
		self.other_detail = self._detail(self.other, "O " + self.tag)

		self.t1 = self._todo(self.a, MEMBER)   # in A, assigned to member
		self.t2 = self._todo(self.a, OWNER)    # in A, assigned to owner
		self.foreign = self._todo(self.other_detail, OWNER)  # different project
		frappe.db.commit()

	def _project(self, pname, owner):
		from frappe.utils import nowdate, add_days
		return frappe.get_doc({
			"doctype": "Project", "project_name": pname, "brand": self.brand,
			"project_owner": owner, "project_leader": owner, "status": "Ongoing",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)

	def _detail(self, project, title):
		return frappe.get_doc({
			"doctype": "Project Detail", "project": project.name, "title": title,
		}).insert(ignore_permissions=True)

	def _todo(self, detail, assignee):
		todo = frappe.get_doc({
			"doctype": "Project Todo", "project": detail.project,
			"project_detail": detail.name, "to_do": "task " + self.tag,
			"assigned_to": assignee, "status": "⚪️ Planned",
		})
		todo.flags.ignore_validate = True
		todo.insert(ignore_permissions=True, ignore_mandatory=True)
		return todo.name

	def tearDown(self):
		frappe.set_user("Administrator")
		for pn in (self.proj.name, self.other.name):
			frappe.db.delete("Project Todo", {"project": pn})
			frappe.db.delete("Project Detail", {"project": pn})
			frappe.delete_doc("Project", pn, ignore_permissions=True, force=1)
		for email, _ in USERS:
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, ignore_permissions=True, force=1)
		frappe.db.commit()

	def _detail_of(self, todo):
		return frappe.db.get_value("Project Todo", todo, "project_detail")

	def test_owner_moves_batch(self):
		frappe.set_user(OWNER)
		res = move_todos(self.b.name, frappe.as_json([self.t1, self.t2]))
		self.assertEqual(res["moved"], 2)
		self.assertEqual(self._detail_of(self.t1), self.b.name)
		self.assertEqual(self._detail_of(self.t2), self.b.name)
		# same-project reparent leaves `project` untouched
		self.assertEqual(frappe.db.get_value("Project Todo", self.t1, "project"), self.proj.name)

	def test_assignee_moves_own(self):
		frappe.set_user(MEMBER)
		res = move_todos(self.b.name, frappe.as_json([self.t1]))
		self.assertEqual(res["moved"], 1)
		self.assertEqual(self._detail_of(self.t1), self.b.name)

	def test_already_in_destination_is_skipped(self):
		frappe.set_user(OWNER)
		res = move_todos(self.a.name, frappe.as_json([self.t1]))
		self.assertEqual(res["moved"], 0)
		self.assertEqual(self._detail_of(self.t1), self.a.name)

	def test_cross_project_refused_and_atomic(self):
		frappe.set_user(OWNER)
		# t1 is valid, foreign is in another project -> whole batch aborts.
		with self.assertRaises(frappe.ValidationError):
			move_todos(self.b.name, frappe.as_json([self.t1, self.foreign]))
		self.assertEqual(self._detail_of(self.t1), self.a.name)  # nothing moved

	def test_stranger_denied(self):
		frappe.set_user(STRANGER)
		with self.assertRaises(frappe.PermissionError):
			move_todos(self.b.name, frappe.as_json([self.t1]))
		self.assertEqual(self._detail_of(self.t1), self.a.name)
