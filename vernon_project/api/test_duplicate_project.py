# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# duplicate_project = structure clone: header + groupings (Glossary) + work items
# (Project Detail), progress reset, NO todos. Cross-doctype links remapped.

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.api.mobile import duplicate_project

LEADER = "dp_leader@example.com"
MEMBER = "dp_member@example.com"
STRANGER = "dp_stranger@example.com"
USERS = ((LEADER, "Dup Leader"), (MEMBER, "Dup Member"), (STRANGER, "Dup Stranger"))


class TestDuplicateProject(unittest.TestCase):
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

		self.pname = "DP Source " + frappe.generate_hash(length=6)
		self.src = frappe.get_doc({
			"doctype": "Project",
			"project_name": self.pname,
			"brand": self.brand,
			"project_owner": "Administrator",
			"project_leader": LEADER,
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [{"user": MEMBER}],
		}).insert(ignore_permissions=True)

		self.gloss = frappe.get_doc({
			"doctype": "Glossary", "project": self.src.name,
			"glossary": "Phase 1", "description": "first phase",
		}).insert(ignore_permissions=True)

		self.detail = frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.src.name,
			"title": "Build the thing",
			"project_deadline": add_days(nowdate(), 20),
			"grouping": self.gloss.name,
			"glossaries": [{"glossary": self.gloss.name}],
			"status": "Ongoing",  # must reset to Pending in the copy
		}).insert(ignore_permissions=True)

		# A todo under the source detail — must NOT appear in the copy. Its field
		# validity is irrelevant here, so skip the controller validation.
		todo = frappe.get_doc({
			"doctype": "Project Todo",
			"project": self.src.name,
			"project_detail": self.detail.name,
			"to_do": "a task",
			"status": "⚪️ Planned",
		})
		todo.flags.ignore_validate = True
		todo.insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		names = frappe.get_all(
			"Project",
			filters={"project_name": ["in", [self.pname, self.pname + " (Copy)"]]},
			pluck="name",
		)
		for pn in names:
			frappe.db.delete("Project Todo", {"project": pn})
			frappe.db.delete("Project Detail", {"project": pn})
			frappe.db.delete("Glossary", {"project": pn})
		for pn in names:
			frappe.delete_doc("Project", pn, ignore_permissions=True, force=1)
		for email, _ in USERS:
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, ignore_permissions=True, force=1)
		frappe.db.commit()

	def test_structure_clone(self):
		res = duplicate_project(self.src.name)  # as Administrator (owner)
		new = res["name"]
		self.assertTrue(res["project_name"].endswith("(Copy)"))

		newdoc = frappe.get_doc("Project", new)
		self.assertEqual(newdoc.status, "Ongoing")  # mirrors source
		self.assertEqual({m.user for m in newdoc.team_members} & {MEMBER}, {MEMBER})

		# groupings copied and re-scoped to the new project
		new_gloss = frappe.get_all("Glossary", filters={"project": new}, fields=["name", "glossary"])
		self.assertEqual(len(new_gloss), 1)
		self.assertEqual(new_gloss[0].glossary, "Phase 1")
		self.assertNotEqual(new_gloss[0].name, self.gloss.name)  # a fresh row

		# work items copied, grouping remapped, progress reset
		new_details = frappe.get_all("Project Detail", filters={"project": new}, pluck="name")
		self.assertEqual(len(new_details), 1)
		nd = frappe.get_doc("Project Detail", new_details[0])
		self.assertEqual(nd.title, "Build the thing")
		self.assertEqual(nd.grouping, new_gloss[0].name)  # remapped, not old
		self.assertEqual([g.glossary for g in nd.glossaries], [new_gloss[0].name])

		# progress reset: no todos carried, rollups fresh
		self.assertEqual(frappe.db.count("Project Todo", {"project": new}), 0)
		self.assertEqual(nd.todo_count, 0)
		self.assertFalse(nd.completed_date)

	def test_denied_for_stranger(self):
		frappe.set_user(STRANGER)
		with self.assertRaises(frappe.PermissionError):
			duplicate_project(self.src.name)
