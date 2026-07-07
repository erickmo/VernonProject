# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days


def _ensure(doctype, name, doc):
	if not frappe.db.exists(doctype, name):
		frappe.get_doc(doc).insert(ignore_permissions=True)


class TestProjectGuards(unittest.TestCase):
	def setUp(self):
		_ensure("Brand", "Test Customer", {
			"doctype": "Brand", "brand_name": "Test Customer"})
		_ensure("Project Group", "Test Project Group", {
			"doctype": "Project Group", "project_name": "Test Project Group"})
		for u in ("owner_u@example.com", "leader_u@example.com", "other_u@example.com"):
			if not frappe.db.exists("User", u):
				frappe.get_doc({"doctype": "User", "email": u, "first_name": u.split("@")[0],
					"send_welcome_email": 0}).insert(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Guard Test Project",
			"brand": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "owner_u@example.com", "project_leader": "leader_u@example.com",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for pd in frappe.get_all("Project Detail", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("Project Detail", pd, force=True, ignore_permissions=True)
		for gl in frappe.get_all("Glossary", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("Glossary", gl, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_role_perms_broadened(self):
		meta = frappe.get_meta("Project")
		perms = {p.role: p for p in meta.permissions}
		self.assertTrue(perms["Project Leader"].write, "Project Leader needs write")
		self.assertTrue(perms["Project Owner"].delete, "Project Owner needs delete")

	def test_non_lead_cannot_edit(self):
		frappe.set_user("other_u@example.com")
		p = frappe.get_doc("Project", self.project.name)
		p.goal = "hijack"
		with self.assertRaises(frappe.PermissionError):
			p.save(ignore_permissions=True)
		frappe.set_user("Administrator")

	def test_leader_can_edit_meta(self):
		frappe.set_user("leader_u@example.com")
		p = frappe.get_doc("Project", self.project.name)
		p.goal = "leader edit ok"
		p.save(ignore_permissions=True)
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Project", self.project.name, "goal"), "leader edit ok")

	def test_leader_cannot_reassign(self):
		frappe.set_user("leader_u@example.com")
		p = frappe.get_doc("Project", self.project.name)
		p.project_owner = "leader_u@example.com"
		with self.assertRaises(frappe.PermissionError):
			p.save(ignore_permissions=True)
		frappe.set_user("Administrator")

	def test_owner_can_reassign(self):
		frappe.set_user("owner_u@example.com")
		p = frappe.get_doc("Project", self.project.name)
		p.project_leader = "other_u@example.com"
		p.save(ignore_permissions=True)
		frappe.set_user("Administrator")
		self.assertEqual(
			frappe.db.get_value("Project", self.project.name, "project_leader"), "other_u@example.com")

	def test_delete_blocked_with_work_items(self):
		grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "G1", "project": self.project.name})
		grouping.insert(ignore_permissions=True)
		frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "WI", "grouping": grouping.name, "project_deadline": add_days(nowdate(), 10),
		}).insert(ignore_permissions=True)
		frappe.db.commit()
		frappe.set_user("owner_u@example.com")
		with self.assertRaises(frappe.ValidationError):
			frappe.delete_doc("Project", self.project.name, ignore_permissions=True)
		frappe.set_user("Administrator")

	def test_non_owner_cannot_delete(self):
		frappe.set_user("leader_u@example.com")
		with self.assertRaises(frappe.PermissionError):
			frappe.delete_doc("Project", self.project.name, ignore_permissions=True)
		frappe.set_user("Administrator")


class TestProjectRewardGuard(unittest.TestCase):
	# Standalone (no fixtures): exercises validate() directly so it runs even
	# while TestProjectGuards' fixtures are stale.
	def test_discount_without_bonus_gives_clear_error(self):
		# bonus=0 with a discount must raise the clear "bonus < discount" message,
		# not the cryptic framework NonNegativeError on the computed Total.
		doc = frappe.get_doc({
			"doctype": "Project", "project_name": "Reward Guard Test",
			"reward_type": "Rupiah", "bonus_amount": 0, "discount": 100,
		})
		with self.assertRaises(frappe.ValidationError) as cm:
			doc.validate()
		self.assertIn("Bonus Amount cannot be less than", str(cm.exception))
