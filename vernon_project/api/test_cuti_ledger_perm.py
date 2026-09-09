# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe


class TestCutiLedgerPerm(unittest.TestCase):
	"""2026-09-09 permission sweep: Cuti Ledger's controller is deliberately
	empty ("exactly like Point Ledger"), so the permission table was the only
	gate -- and HR Manager held unconditional create/write/delete directly.
	Any HR Manager could mint, edit, or erase a leave-balance row with no
	validation and no audit trail, bypassing every quota/approval check in
	attendance.py. Same shape as the Point Ledger delete-grant fix, one
	doctype over."""

	HR_MANAGER = "clp_hr_manager@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", self.HR_MANAGER):
			frappe.get_doc({
				"doctype": "User", "email": self.HR_MANAGER, "first_name": "CLP",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", self.HR_MANAGER)
		if not any(r.role == "HR Manager" for r in u.roles):
			u.append("roles", {"role": "HR Manager"})
			u.save(ignore_permissions=True)
		self.row = frappe.get_doc({
			"doctype": "Cuti Ledger", "employee": self.HR_MANAGER, "entry_type": "Grant",
			"year": frappe.utils.now_datetime().year, "days": 12,
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Cuti Ledger", self.row.name):
			frappe.delete_doc("Cuti Ledger", self.row.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_hr_manager_cannot_create_a_cuti_ledger_row_directly(self):
		frappe.set_user(self.HR_MANAGER)
		try:
			with self.assertRaises(frappe.PermissionError):
				frappe.get_doc({
					"doctype": "Cuti Ledger", "employee": self.HR_MANAGER,
					"entry_type": "Correction", "year": frappe.utils.now_datetime().year, "days": 999,
				}).insert()
		finally:
			frappe.set_user("Administrator")

	def test_hr_manager_cannot_write_or_delete_an_existing_row(self):
		frappe.set_user(self.HR_MANAGER)
		try:
			doc = frappe.get_doc("Cuti Ledger", self.row.name)
			doc.days = 999
			with self.assertRaises(frappe.PermissionError):
				doc.save()
			with self.assertRaises(frappe.PermissionError):
				frappe.delete_doc("Cuti Ledger", self.row.name)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Cuti Ledger", self.row.name, "days"), 12)

	def test_hr_manager_can_still_read_the_ledger(self):
		frappe.set_user(self.HR_MANAGER)
		try:
			self.assertTrue(frappe.has_permission("Cuti Ledger", "read", self.row))
		finally:
			frappe.set_user("Administrator")
