# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""change_my_password verifies the CURRENT password before setting a new one, and
refuses Guest outright. Neither had a test — delete either check and nothing went red.

The passwords here are random and the account is disabled again in tearDown. This
suite runs against the live site, and a test user left enabled with a password
written into the source would be a working login for anyone who reads the repo.
"""

import unittest

import frappe
from frappe.utils.password import check_password

from vernon_project.api.mobile import change_my_password
from vernon_project.tests.no_leak import NoLeakMixin

USER = "change-pw@test.local"


class TestChangeMyPassword(NoLeakMixin, unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", USER):
			frappe.get_doc({"doctype": "User", "email": USER, "first_name": "Pw",
			                "send_welcome_email": 0}).insert(ignore_permissions=True)
		# Random, and long enough to clear the strength policy the endpoint applies.
		self.original = f"Vx-{frappe.generate_hash(length=18)}-Aa1"
		frappe.get_doc("User", USER).db_set("enabled", 1)
		from frappe.utils.password import update_password
		update_password(USER, self.original)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		# Disabled, so whatever password this test left behind is not a way in.
		if frappe.db.exists("User", USER):
			frappe.get_doc("User", USER).db_set("enabled", 0)
		frappe.db.commit()

	def test_a_guest_cannot_change_a_password(self):
		frappe.set_user("Guest")
		try:
			with self.assertRaises(frappe.AuthenticationError):
				change_my_password("whatever", "Something-New-123")
		finally:
			frappe.set_user("Administrator")

	def test_the_wrong_current_password_is_refused(self):
		"""The check that matters. Without it, anyone holding a live session — a
		borrowed laptop, a hijacked cookie — could set a new password without knowing
		the old one and lock the owner out."""
		frappe.set_user(USER)
		new = f"Zz-{frappe.generate_hash(length=18)}-Bb2"
		try:
			with self.assertRaises(frappe.ValidationError) as caught:
				change_my_password("not-the-current-password", new)
			self.assertIn("Current password is incorrect", str(caught.exception))
		finally:
			frappe.set_user("Administrator")
		# The refusal must not have changed anything.
		self.assertTrue(check_password(USER, self.original), "the original password must still work")
		with self.assertRaises(frappe.AuthenticationError):
			check_password(USER, new)

	def test_a_blank_new_password_is_refused(self):
		frappe.set_user(USER)
		try:
			with self.assertRaises(frappe.ValidationError):
				change_my_password(self.original, "")
		finally:
			frappe.set_user("Administrator")
		self.assertTrue(check_password(USER, self.original))

	def test_the_right_current_password_changes_it(self):
		"""The positive side, so the guard cannot be 'fixed' by refusing everyone."""
		frappe.set_user(USER)
		new = f"Qq-{frappe.generate_hash(length=18)}-Cc3"
		try:
			result = change_my_password(self.original, new)
		finally:
			frappe.set_user("Administrator")
		self.assertTrue(result["ok"])
		self.assertTrue(check_password(USER, new), "the new password must work")
		with self.assertRaises(frappe.AuthenticationError):
			check_password(USER, self.original)
