# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from vernon_project.tests.no_leak import NoLeakMixin


class TestCutiLedgerPerm(NoLeakMixin, unittest.TestCase):
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


class TestCutiAdjustmentEndpointGate(NoLeakMixin, unittest.TestCase):
	"""The class above pins the DOCTYPE permissions — HR Manager cannot touch a Cuti
	Ledger row directly. `post_cuti_adjustment` is the sanctioned way in, and its own
	`_is_hr` gate had no test: delete it and anyone could mint leave days for anyone.

	Every refusal here asserts the LEDGER as well as the exception, because a guard
	that throws after writing would satisfy assertRaises on its own.
	"""

	HR = "cage_hr@example.com"
	STAFF = "cage_staff@example.com"
	SUBJECT = "cage_subject@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		for email, roles in ((self.HR, ("HR Manager",)), (self.STAFF, ()), (self.SUBJECT, ())):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": email[:6],
				                "send_welcome_email": 0}).insert(ignore_permissions=True)
			u = frappe.get_doc("User", email)
			for role in roles:
				if not any(r.role == role for r in u.roles):
					u.append("roles", {"role": role})
			u.save(ignore_permissions=True)
		self.year = frappe.utils.now_datetime().year
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for row in frappe.get_all("Cuti Ledger", filters={"employee": self.SUBJECT}, pluck="name"):
			frappe.delete_doc("Cuti Ledger", row, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _rows(self):
		return frappe.get_all("Cuti Ledger", filters={"employee": self.SUBJECT}, pluck="name")

	def test_a_normal_user_cannot_post_an_adjustment(self):
		from vernon_project.api.cuti_ledger import post_cuti_adjustment
		frappe.set_user(self.STAFF)
		with self.assertRaises(frappe.PermissionError):
			post_cuti_adjustment(self.SUBJECT, "Bonus", 5, self.year, "self-granted")
		frappe.set_user("Administrator")
		self.assertEqual(self._rows(), [], "a refused adjustment must not have written a ledger row")

	def test_a_normal_user_cannot_remint_someone_elses_grant(self):
		from vernon_project.api.cuti_ledger import remint_grant
		frappe.set_user(self.STAFF)
		with self.assertRaises(frappe.PermissionError):
			remint_grant(self.SUBJECT, self.year)
		frappe.set_user("Administrator")
		self.assertEqual(self._rows(), [], "a refused re-mint must not have written a ledger row")

	def test_hr_can_post_an_adjustment(self):
		"""The positive side, so the gate cannot be 'fixed' by refusing everyone."""
		from vernon_project.api.cuti_ledger import post_cuti_adjustment
		frappe.set_user(self.HR)
		result = post_cuti_adjustment(self.SUBJECT, "Bonus", 3, self.year, "extra for the sprint")
		self.assertEqual(result["status"], "ok")
		frappe.set_user("Administrator")
		self.assertEqual(len(self._rows()), 1, "HR's adjustment must reach the ledger")
