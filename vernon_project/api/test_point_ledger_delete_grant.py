# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe


class TestPointLedgerDeleteGrant(unittest.TestCase):
	"""2026-09-09 permission sweep, follow-up to the 2026-09-07/08 create/write
	fix (check_no_create_role.py): Group Manager still held unconditional
	`delete` on Point Ledger -- the app's real-money ledger -- with a stub
	controller and no has_permission hook. Any Group Manager could erase a
	penalty deduction or a rival's earned points with no audit trail."""

	GROUP_MANAGER = "pldg_group_manager@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", self.GROUP_MANAGER):
			frappe.get_doc({
				"doctype": "User", "email": self.GROUP_MANAGER, "first_name": "PLDG",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", self.GROUP_MANAGER)
		if not any(r.role == "Group Manager" for r in u.roles):
			u.append("roles", {"role": "Group Manager"})
			u.save(ignore_permissions=True)
		self.row = frappe.get_doc({
			"doctype": "Point Ledger", "user": self.GROUP_MANAGER, "points_earned": 10,
			"point": 10, "source": "Grant",
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Point Ledger", self.row.name):
			frappe.delete_doc("Point Ledger", self.row.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_group_manager_cannot_delete_a_point_ledger_row(self):
		frappe.set_user(self.GROUP_MANAGER)
		try:
			with self.assertRaises(frappe.PermissionError):
				frappe.delete_doc("Point Ledger", self.row.name)
		finally:
			frappe.set_user("Administrator")
		self.assertTrue(frappe.db.exists("Point Ledger", self.row.name))

	def test_system_manager_can_still_delete_a_point_ledger_row(self):
		# Administrator always holds System Manager -- confirms the fix is
		# role-scoped, not an accidental blanket lockout.
		frappe.delete_doc("Point Ledger", self.row.name, force=True)
		self.assertFalse(frappe.db.exists("Point Ledger", self.row.name))
