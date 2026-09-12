# Copyright (c) 2026, Vernon and contributors
# See license.txt
#
# 94cops8ldi (follow-up on h5u6l8iog9): the Me/Profile "API Token" card leaked
# the user's own api_key in plaintext on every load. Erick's own words: "I
# want the key is hidden" / "the mcp link ... will only be shown once (when
# generate button is clicked)". The real design here is Frappe's native
# per-user `Authorization: token <key>:<secret>` credential (mirrors core
# User.generate_keys, see api_token.py) -- NOT a per-user "?token=" MCP URL
# (that URL only exists as ONE static, System-Manager-only, non-rotatable
# secret read from mcp_server/.env.http; there is no "generate" flow for it,
# so "shown once when generate is clicked" cannot apply to it). Scope of this
# suite: the per-user key/secret only.

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils.password import get_decrypted_password

from vernon_project.api.api_token import (
	generate_api_token,
	get_api_token_status,
	revoke_api_token,
)
from vernon_project.tests.no_leak import NoLeakMixin

OWNER = "api_token_owner@example.com"
OTHER = "api_token_other@example.com"


def _ensure_user(email):
	if not frappe.db.exists("User", email):
		frappe.get_doc({
			"doctype": "User", "email": email,
			"first_name": email.split("@")[0], "send_welcome_email": 0,
		}).insert(ignore_permissions=True)
		frappe.db.commit()


class TestApiTokenStatusDoesNotLeakTheKey(NoLeakMixin, FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		_ensure_user(OWNER)
		_ensure_user(OTHER)
		frappe.db.set_value("User", OWNER, "api_key", None, update_modified=False)
		frappe.db.set_value("User", OTHER, "api_key", None, update_modified=False)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_status_before_generating_reports_no_token(self):
		frappe.set_user(OWNER)
		result = get_api_token_status()
		self.assertFalse(result["has_token"])
		self.assertIsNone(result["masked_key"])

	def test_generate_returns_the_plaintext_key_and_secret_once(self):
		frappe.set_user(OWNER)
		result = generate_api_token()
		self.assertIn("api_key", result)
		self.assertIn("api_secret", result)
		self.assertTrue(result["api_key"])
		self.assertTrue(result["api_secret"])

	def test_status_after_generating_never_returns_the_plaintext_key(self):
		"""The actual bug: get_api_token_status used to return the raw
		api_key on every read. This is the regression guard for the fix."""
		frappe.set_user(OWNER)
		generate_api_token()
		result = get_api_token_status()
		self.assertNotIn("api_key", result)
		self.assertTrue(result["has_token"])
		self.assertIsNotNone(result["masked_key"])

	def test_masked_key_reveals_only_a_short_trailing_hint(self):
		frappe.set_user(OWNER)
		fresh = generate_api_token()
		result = get_api_token_status()
		masked = result["masked_key"]
		self.assertLess(len(masked), len(fresh["api_key"]))
		self.assertTrue(fresh["api_key"].endswith(masked))
		self.assertFalse(fresh["api_key"].startswith(masked))

	def test_stored_secret_is_not_plaintext_in_the_doctype_row(self):
		"""api_secret is a core Frappe `Password` field -- the ORM routes it
		through encrypted storage (__Auth), never the User table's own row,
		regardless of how the app code assigns it. Confirms this app didn't
		accidentally lose that by assigning the field directly instead of
		calling set_password()."""
		frappe.set_user(OWNER)
		fresh = generate_api_token()
		raw = frappe.db.sql(
			"SELECT api_secret FROM `tabUser` WHERE name=%s", (OWNER,)
		)[0][0]
		self.assertNotEqual(raw, fresh["api_secret"])

	def test_revoke_clears_the_status(self):
		frappe.set_user(OWNER)
		generate_api_token()
		revoke_api_token()
		result = get_api_token_status()
		self.assertFalse(result["has_token"])
		self.assertIsNone(result["masked_key"])


class TestApiTokenRotation(NoLeakMixin, FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		_ensure_user(OWNER)
		frappe.db.set_value("User", OWNER, "api_key", None, update_modified=False)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_regenerate_keeps_the_key_but_rotates_the_secret(self):
		"""Mirrors core User.generate_keys exactly: api_key is stable once
		set (it's the identifier half); api_secret always rotates. A stable
		key + rotated secret still fully invalidates the old credential pair
		-- (key:old_secret) no longer authenticates once (key:new_secret) is
		the one stored."""
		frappe.set_user(OWNER)
		first = generate_api_token()
		second = generate_api_token()
		self.assertEqual(first["api_key"], second["api_key"])
		self.assertNotEqual(first["api_secret"], second["api_secret"])

	def test_old_secret_no_longer_matches_what_is_stored(self):
		frappe.set_user(OWNER)
		first = generate_api_token()
		second = generate_api_token()
		stored = get_decrypted_password("User", OWNER, "api_secret", raise_exception=False)
		self.assertEqual(stored, second["api_secret"])
		self.assertNotEqual(stored, first["api_secret"])

	def test_tokens_are_unique_and_the_same_length_as_frappes_own(self):
		"""15 hex chars, frappe.generate_hash(secrets.token_hex) -- matches
		core User.generate_keys' own length exactly (see user.py), not an
		arbitrary bar."""
		frappe.set_user(OWNER)
		seen = set()
		for _ in range(10):
			t = generate_api_token()
			self.assertEqual(len(t["api_key"]), 15)
			self.assertEqual(len(t["api_secret"]), 15)
			seen.add(t["api_secret"])
		self.assertEqual(len(seen), 10, "api_secret repeated across regenerates")


class TestApiTokenPermissionBoundary(NoLeakMixin, FrappeTestCase):
	"""SECURITY GATE (c)/(f): scoped to the logged-in user; there is no
	`user` parameter on any of these three methods for a client to forge, so
	the boundary is structural, not a check that can be bypassed by a
	crafted payload. Confirms that stays true and that OTHER can never
	read/rotate/revoke OWNER's token."""

	def setUp(self):
		frappe.set_user("Administrator")
		_ensure_user(OWNER)
		_ensure_user(OTHER)
		frappe.db.set_value("User", OWNER, "api_key", None, update_modified=False)
		frappe.db.set_value("User", OTHER, "api_key", None, update_modified=False)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_none_of_the_three_methods_accept_a_user_argument(self):
		import inspect
		for fn in (get_api_token_status, generate_api_token, revoke_api_token):
			params = inspect.signature(fn).parameters
			self.assertNotIn("user", params, f"{fn.__name__} accepts a user param -- forgeable identity")

	def test_generating_as_other_never_touches_owner(self):
		frappe.set_user(OWNER)
		owner_token = generate_api_token()
		frappe.set_user(OTHER)
		generate_api_token()
		frappe.set_user(OWNER)
		owner_status = get_api_token_status()
		still_owners = frappe.db.get_value("User", OWNER, "api_key")
		self.assertEqual(still_owners, owner_token["api_key"])
		self.assertTrue(owner_status["has_token"])

	def test_guest_is_refused(self):
		"""The code's own gate (`_self()`) raises AuthenticationError for
		Guest -- correcting the originally-enumerated PermissionError, which
		doesn't match what "not logged in" actually raises here."""
		frappe.set_user("Guest")
		try:
			with self.assertRaises(frappe.AuthenticationError):
				get_api_token_status()
			with self.assertRaises(frappe.AuthenticationError):
				generate_api_token()
		finally:
			frappe.set_user("Administrator")
