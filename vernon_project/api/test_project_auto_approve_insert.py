# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

PLAIN = "aa-plain-owner@test.local"      # Project Owner role, NOT Partner
PARTNER = "aa-partner-owner@test.local"  # Project Owner role AND Partner


class TestProjectAutoApproveOnInsert(unittest.TestCase):
	"""auto_approve skips the owner's approval gate for every todo in a project —
	the step immediately before points mint at ✅ Completed — so it is reserved for
	the Project Owner holding the "Partner" role.

	That was enforced on UPDATE but not on INSERT: validate_auto_approve_change
	returned early when there was no previous version, and Project Owner holds
	create=1. A non-Partner could therefore create a project that already skipped
	the gate, one-way, since they could not turn it back off afterwards.

	Both axes are asserted, because either alone leaves the guard able to regress:
	the ROLE axis (who may switch it on) and the VALUE axis (an ordinary project
	creation must still work — that is the direction where a security fix becomes
	an outage).
	"""

	@classmethod
	def _user(cls, email, roles):
		if not frappe.db.exists("User", email):
			u = frappe.get_doc({
				"doctype": "User", "email": email, "first_name": email.split("@")[0],
				"send_welcome_email": 0,
			})
			for r in roles:
				u.append("roles", {"role": r})
			u.insert(ignore_permissions=True)

	def setUp(self):
		frappe.set_user("Administrator")
		self._user(PLAIN, ("Project Team", "Project Owner", "Project Leader"))
		self._user(PARTNER, ("Project Team", "Project Owner", "Project Leader", "Partner"))
		self.brand = frappe.db.get_value("Brand", {}, "name")

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def _project(self, owner, auto_approve=None, ignore_permissions=False):
		data = {
			"doctype": "Project", "project_name": f"ZZ aa-insert {owner} {auto_approve}",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"brand": self.brand, "project_owner": owner, "project_leader": owner,
			"status": "Ongoing",
		}
		if auto_approve is not None:
			data["auto_approve"] = auto_approve
		doc = frappe.get_doc(data)
		return doc.insert(ignore_permissions=ignore_permissions)

	# --- ROLE axis -------------------------------------------------------------
	def test_non_partner_cannot_create_an_auto_approving_project(self):
		frappe.set_user(PLAIN)
		with self.assertRaises(frappe.PermissionError):
			self._project(PLAIN, auto_approve=1)

	def test_partner_still_can(self):
		frappe.set_user(PARTNER)
		p = self._project(PARTNER, auto_approve=1)
		self.assertEqual(frappe.db.get_value("Project", p.name, "auto_approve"), 1)

	def test_non_partner_cannot_name_someone_else_owner_to_get_it(self):
		# the caller must BE the owner they name, or the check is trivially dodged
		frappe.set_user(PLAIN)
		with self.assertRaises(frappe.PermissionError):
			self._project(PARTNER, auto_approve=1)

	# --- VALUE axis: ordinary creation must keep working -----------------------
	def test_an_ordinary_project_creation_is_unaffected(self):
		frappe.set_user(PLAIN)
		p = self._project(PLAIN, auto_approve=0)
		self.assertEqual(frappe.db.get_value("Project", p.name, "auto_approve"), 0)

	def test_creation_without_the_field_at_all_is_unaffected(self):
		frappe.set_user(PLAIN)
		p = self._project(PLAIN, auto_approve=None)
		self.assertFalse(frappe.db.get_value("Project", p.name, "auto_approve"))

	def test_an_internal_creator_passing_ignore_permissions_still_works(self):
		# duplicate_project copies src.auto_approve and inserts with
		# ignore_permissions; it carries an already-authorised flag, not a new one.
		frappe.set_user(PLAIN)
		p = self._project(PLAIN, auto_approve=1, ignore_permissions=True)
		self.assertEqual(frappe.db.get_value("Project", p.name, "auto_approve"), 1)

	# --- the UPDATE path must stay exactly as strict as it already was ---------
	def test_update_is_still_refused_for_a_non_partner(self):
		frappe.set_user(PARTNER)
		p = self._project(PARTNER, auto_approve=0)
		frappe.set_user(PLAIN)
		doc = frappe.get_doc("Project", p.name)
		doc.auto_approve = 1
		with self.assertRaises(frappe.PermissionError):
			doc.save()

	def test_update_is_refused_even_with_ignore_permissions(self):
		# update_project saves with ignore_permissions, so the gate must bind there
		frappe.set_user(PARTNER)
		p = self._project(PARTNER, auto_approve=0)
		frappe.set_user(PLAIN)
		doc = frappe.get_doc("Project", p.name)
		doc.auto_approve = 1
		with self.assertRaises(frappe.PermissionError):
			doc.save(ignore_permissions=True)
