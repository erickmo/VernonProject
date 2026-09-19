# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""Two HR-only endpoints that no test named.

`hr_remove_photo` clears someone else's profile photo; `sync_holidays` rewrites the
holiday list every attendance calculation reads. Both are gated by `_is_hr` and
neither gate had a test — delete either line and nothing went red.

Each refusal asserts the STORED state as well as the exception. A guard that throws
AFTER doing its work would satisfy assertRaises on its own, which is the failure
mode these tests exist to rule out.
"""

import unittest

import frappe

from vernon_project.api.attendance import sync_holidays
from vernon_project.api.mobile import hr_remove_photo
from vernon_project.tests.no_leak import NoLeakMixin

HR = "hrgate_hr@test.local"
STAFF = "hrgate_staff@test.local"
SUBJECT = "hrgate_subject@test.local"
PHOTO = "/files/hrgate-subject-photo.png"


class TestHrOnlyGates(NoLeakMixin, unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		for email, roles in ((HR, ("HR Manager",)), (STAFF, ()), (SUBJECT, ())):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": email[:8],
				                "send_welcome_email": 0}).insert(ignore_permissions=True)
			u = frappe.get_doc("User", email)
			for role in roles:
				if not any(r.role == role for r in u.roles):
					u.append("roles", {"role": role})
			u.save(ignore_permissions=True)
		if not frappe.db.exists("Employee Profile", {"user": SUBJECT}):
			frappe.get_doc({"doctype": "Employee Profile", "user": SUBJECT}).insert(ignore_permissions=True)
		self.profile = frappe.db.get_value("Employee Profile", {"user": SUBJECT}, "name")
		frappe.db.set_value("Employee Profile", self.profile, "photo", PHOTO)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if self.profile and frappe.db.exists("Employee Profile", self.profile):
			frappe.delete_doc("Employee Profile", self.profile, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _photo(self):
		return frappe.db.get_value("Employee Profile", self.profile, "photo")

	# --- hr_remove_photo -------------------------------------------------------

	def test_a_normal_user_cannot_clear_someone_elses_photo(self):
		frappe.set_user(STAFF)
		try:
			with self.assertRaises(frappe.PermissionError):
				hr_remove_photo(SUBJECT)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(self._photo(), PHOTO, "a refused removal must leave the photo in place")

	def test_a_user_cannot_clear_their_own_photo_through_the_hr_endpoint(self):
		"""This endpoint is not the self-service path — it takes a `user` argument and
		acts on anyone. Being the subject does not make the caller HR."""
		frappe.set_user(SUBJECT)
		try:
			with self.assertRaises(frappe.PermissionError):
				hr_remove_photo(SUBJECT)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(self._photo(), PHOTO)

	def test_hr_can_clear_a_photo(self):
		"""The positive side, so the gate cannot be 'fixed' by refusing everyone."""
		frappe.set_user(HR)
		try:
			result = hr_remove_photo(SUBJECT)
		finally:
			frappe.set_user("Administrator")
		self.assertTrue(result["ok"])
		self.assertIsNone(self._photo(), "HR's removal must actually clear the stored photo")

	# --- sync_holidays ---------------------------------------------------------

	def test_a_normal_user_cannot_sync_the_holiday_list(self):
		"""Only the refusal is covered here, deliberately. Past the gate this endpoint
		fetches an ICS feed from Google and rewrites the Attendance Holiday List every
		attendance calculation reads — a test must not depend on that network call, and
		must not rewrite a live holiday list as a side effect. The gate is the part
		that had no test, and it is the part tested.
		"""
		frappe.set_user(STAFF)
		try:
			with self.assertRaises(frappe.PermissionError):
				sync_holidays("Any List", 2026)
		finally:
			frappe.set_user("Administrator")

	def test_the_holiday_sync_refuses_before_it_reaches_the_network(self):
		"""The refusal must come from the gate, not from a failed fetch or a missing
		list — otherwise a green test would say nothing about permissions. A
		PermissionError for a list name that does not exist proves the order: the
		guard ran first."""
		self.assertFalse(frappe.db.exists("Attendance Holiday List", "No Such List At All"))
		frappe.set_user(STAFF)
		try:
			with self.assertRaises(frappe.PermissionError):
				sync_holidays("No Such List At All", 2026)
		finally:
			frappe.set_user("Administrator")
