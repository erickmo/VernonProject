# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from vernon_project.tests.no_leak import NoLeakMixin


class TestEmployeeProfileDiscPermlevel(NoLeakMixin, unittest.TestCase):
	"""2026-09-09 permission sweep: has_permission scopes Employee Profile
	writes to the caller's own row ("All" role), correctly walling off
	bank/NIK fields at permlevel:1 -- but disc_scores/disc_type/
	disc_completed_on/personality_scores/personality_completed_on were
	read_only:1 (form-only) at permlevel:0, so an employee could fabricate
	their own DISC/personality result via frappe.client.set_value on their
	own row, bypassing api/disc.py's submit_disc_test (which always
	scores server-side from raw answers, never trusts a client-sent score,
	then saves with ignore_permissions=True -- unaffected by permlevel).
	Fixed by moving those 5 fields to permlevel:1, same tier as the
	existing bank/NIK fields on this doctype."""

	USER = "epdp_user@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", self.USER):
			frappe.get_doc({
				"doctype": "User", "email": self.USER, "first_name": "EPDP",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		if frappe.db.exists("Employee Profile", {"user": self.USER}):
			self.profile = frappe.get_doc("Employee Profile", {"user": self.USER})
		else:
			self.profile = frappe.get_doc({
				"doctype": "Employee Profile", "user": self.USER,
			}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Employee Profile", self.profile.name):
			frappe.delete_doc("Employee Profile", self.profile.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_own_user_cannot_fabricate_disc_result(self):
		# Frappe's permlevel guard resets permlevel-1 field edits silently on
		# save() rather than raising -- see the identical note on the
		# internship_certificate permlevel fix.
		frappe.set_user(self.USER)
		try:
			doc = frappe.get_doc("Employee Profile", self.profile.name)
			doc.disc_scores = '{"D": 99, "I": 99, "S": 99, "C": 99}'
			doc.disc_type = "D"
			doc.save()  # own row -> base write allowed, permlevel-1 edit still dropped
		finally:
			frappe.set_user("Administrator")
		reloaded = frappe.get_doc("Employee Profile", self.profile.name)
		self.assertFalse(reloaded.disc_scores)
		self.assertFalse(reloaded.disc_type)

	def test_own_user_can_still_edit_ordinary_fields(self):
		frappe.set_user(self.USER)
		try:
			doc = frappe.get_doc("Employee Profile", self.profile.name)
			doc.home_address = "Updated by self"
			doc.save()
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(
			frappe.db.get_value("Employee Profile", self.profile.name, "home_address"), "Updated by self")

	def test_system_manager_can_still_set_disc_fields(self):
		doc = frappe.get_doc("Employee Profile", self.profile.name)
		doc.disc_scores = '{"D": 10}'
		doc.disc_type = "D"
		doc.save()
		self.assertEqual(frappe.db.get_value("Employee Profile", self.profile.name, "disc_type"), "D")
