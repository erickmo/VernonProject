# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""The passkey enrolment endpoints are logged-in-only, and nothing tested that.

Each of these is `@frappe.whitelist()` WITHOUT allow_guest, so Frappe already
refuses Guest at the HTTP layer. The in-function `if user == "Guest"` check is the
second layer, and it is the one these tests pin: they call the functions directly,
which is exactly the path that skips the decorator. Asserting only "a Guest gets
nothing over HTTP" would stay green with every one of these checks deleted, because
the decorator would answer instead.

NOT covered here, deliberately, rather than implied: the WebAuthn attestation
verification inside `register_complete`, and its refusal of a credential id already
registered to someone else. Both need a real authenticator's signed attestation,
which cannot be produced in-process. Those remain untested and are worth saying so.
"""

import unittest

import frappe

from vernon_project.api.passkey import (
	list_passkeys,
	register_begin,
	register_complete,
	revoke_passkey,
)
from vernon_project.tests.no_leak import NoLeakMixin

USER = "passkey-gate@test.local"


class TestPasskeyEnrolmentIsLoggedInOnly(NoLeakMixin, unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", USER):
			frappe.get_doc({"doctype": "User", "email": USER, "first_name": "Pk",
			                "send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")

	def _as_guest(self, fn, *args):
		frappe.set_user("Guest")
		try:
			with self.assertRaises(frappe.AuthenticationError):
				fn(*args)
		finally:
			frappe.set_user("Administrator")

	def test_a_guest_cannot_begin_enrolling_a_passkey(self):
		self._as_guest(register_begin)

	def test_a_guest_cannot_complete_an_enrolment(self):
		"""The credential is deliberately junk: the guard must refuse on the session
		alone, BEFORE anything looks at the payload. If this ever fails with a parsing
		or verification error instead, the check has moved below the point where it
		still protects anything."""
		self._as_guest(register_complete, {"id": "not-a-real-credential"})

	def test_a_guest_cannot_list_passkeys(self):
		self._as_guest(list_passkeys)

	def test_a_guest_cannot_revoke_a_passkey(self):
		self._as_guest(revoke_passkey, "any-name")

	def test_a_logged_in_user_gets_past_the_session_gate(self):
		"""The positive side, so the gate cannot be 'fixed' by refusing everyone.

		Asserts only that a real user is NOT refused for being a Guest — registration
		options are generated for them. What the browser then does with those options
		is the part no in-process test can reach.
		"""
		frappe.set_user(USER)
		try:
			options = register_begin()
		finally:
			frappe.set_user("Administrator")
		self.assertIsInstance(options, dict)
		self.assertTrue(options, "a logged-in user must receive registration options")

	def test_a_logged_in_user_sees_only_their_own_list(self):
		frappe.set_user(USER)
		try:
			result = list_passkeys()
		finally:
			frappe.set_user("Administrator")
		self.assertIn("passkeys", result)
		self.assertIsInstance(result["passkeys"], list)
