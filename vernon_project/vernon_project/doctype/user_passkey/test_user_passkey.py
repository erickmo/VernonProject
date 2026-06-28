# Copyright (c) 2026, Vernon and contributors
# See license.txt
#
# Covers the non-cryptographic logic of passkey login. The WebAuthn signature
# verification itself lives in py_webauthn (tested upstream) and needs a real
# authenticator, so it is exercised manually in a browser, not here.

import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_project.api import passkey


class TestUserPasskey(FrappeTestCase):
	def test_user_handle_is_stable_and_opaque(self):
		h1 = passkey._user_handle("alice@example.com")
		h2 = passkey._user_handle("alice@example.com")
		self.assertEqual(h1, h2)
		self.assertEqual(len(h1), 16)
		self.assertNotEqual(h1, passkey._user_handle("bob@example.com"))

	def test_challenge_is_single_use(self):
		passkey._store_challenge("test", "handle-1", b"the-challenge")
		self.assertEqual(passkey._pop_challenge("test", "handle-1"), b"the-challenge")
		# Replay must fail — the challenge is consumed on first use.
		with self.assertRaises(frappe.ValidationError):
			passkey._pop_challenge("test", "handle-1")

	def test_register_begin_requires_user_verification(self):
		user = frappe.db.get_value(
			"User", {"enabled": 1, "name": ["not in", ("Guest", "Administrator")]}, "name"
		)
		if not user:
			self.skipTest("no enabled non-system user on this site")
		frappe.set_user(user)
		try:
			options = passkey.register_begin()
		finally:
			frappe.set_user("Administrator")
		self.assertIn("challenge", options)
		self.assertEqual(options["rp"]["id"], passkey._rp_id())
		self.assertEqual(options["authenticatorSelection"]["residentKey"], "required")
		self.assertEqual(options["authenticatorSelection"]["userVerification"], "required")

	def test_revoke_is_owner_scoped(self):
		owner = "owner@passkey.test"
		other = "other@passkey.test"
		for u in (owner, other):
			if not frappe.db.exists("User", u):
				frappe.get_doc(
					{"doctype": "User", "email": u, "first_name": u, "send_welcome_email": 0}
				).insert(ignore_permissions=True)

		row = frappe.get_doc(
			{
				"doctype": "User Passkey",
				"user": owner,
				"label": "Test device",
				"credential_id": frappe.generate_hash(length=20),
				"public_key": "x",
				"sign_count": 0,
			}
		).insert(ignore_permissions=True)

		# A different user may not revoke it.
		frappe.set_user(other)
		with self.assertRaises(frappe.PermissionError):
			passkey.revoke_passkey(row.name)
		self.assertTrue(frappe.db.exists("User Passkey", row.name))

		# The owner can.
		frappe.set_user(owner)
		try:
			passkey.revoke_passkey(row.name)
		finally:
			frappe.set_user("Administrator")
		self.assertFalse(frappe.db.exists("User Passkey", row.name))
