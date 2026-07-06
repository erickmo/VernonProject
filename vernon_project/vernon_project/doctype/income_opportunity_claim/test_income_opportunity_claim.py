# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days


class TestIncomeOpportunityClaim(unittest.TestCase):
	def setUp(self):
		for email, first in (("claim_u1@example.com", "C1"), ("claim_u2@example.com", "C2")):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": first,
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		self.opp = frappe.get_doc({
			"doctype": "Income Opportunity", "title": "Lead Reward",
			"reward": "Bonus", "period_start": nowdate(), "status": "Open",
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Income Opportunity Claim", pluck="name"):
			frappe.delete_doc("Income Opportunity Claim", name, force=True, ignore_permissions=True)
		frappe.delete_doc("Income Opportunity", self.opp.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _submit_as(self, user, opportunity=None, details="A lead"):
		frappe.set_user(user)
		doc = frappe.get_doc({
			"doctype": "Income Opportunity Claim",
			"opportunity": opportunity or self.opp.name,
			"claimed_by": "Administrator",  # bogus value; server must overwrite
			"status": "Approved",           # bogus value; server must reset
			"details": details,
		}).insert()
		frappe.db.commit()
		return doc

	def test_claimed_by_forced_to_session_user(self):
		doc = self._submit_as("claim_u1@example.com")
		self.assertEqual(doc.claimed_by, "claim_u1@example.com")

	def test_new_claim_status_reset_to_submitted(self):
		doc = self._submit_as("claim_u1@example.com")
		self.assertEqual(doc.status, "Submitted")

	def test_claim_rejected_when_opportunity_closed(self):
		frappe.set_user("Administrator")
		self.opp.status = "Closed"
		self.opp.save(ignore_permissions=True)
		frappe.db.commit()
		with self.assertRaises(frappe.ValidationError):
			self._submit_as("claim_u1@example.com")

	def test_claim_rejected_when_period_ended(self):
		frappe.set_user("Administrator")
		self.opp.period_end = add_days(nowdate(), -1)
		self.opp.save(ignore_permissions=True)
		frappe.db.commit()
		with self.assertRaises(frappe.ValidationError):
			self._submit_as("claim_u1@example.com")

	def test_guest_cannot_submit(self):
		# ignore_permissions skips the create-perm gate but STILL runs validate(),
		# isolating the Guest guard so this deterministically raises ValidationError.
		frappe.set_user("Guest")
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({
				"doctype": "Income Opportunity Claim",
				"opportunity": self.opp.name,
				"details": "sneaky",
			}).insert(ignore_permissions=True)

	def test_regular_user_cannot_change_status(self):
		doc = self._submit_as("claim_u1@example.com")
		frappe.set_user("claim_u1@example.com")
		reloaded = frappe.get_doc("Income Opportunity Claim", doc.name)
		reloaded.status = "Paid"
		with self.assertRaises(frappe.PermissionError):
			reloaded.save()

	def test_user_cannot_read_other_users_claim(self):
		doc = self._submit_as("claim_u1@example.com")
		frappe.set_user("claim_u2@example.com")
		self.assertFalse(
			frappe.get_doc("Income Opportunity Claim", doc.name).has_permission("read")
		)

	def test_system_manager_can_advance_status(self):
		doc = self._submit_as("claim_u1@example.com")
		frappe.set_user("Administrator")
		doc = frappe.get_doc("Income Opportunity Claim", doc.name)
		doc.status = "Approved"
		doc.save()  # no raise
		self.assertEqual(frappe.db.get_value("Income Opportunity Claim", doc.name, "status"), "Approved")
