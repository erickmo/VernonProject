# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api import passkey

TITLE = "Passkey client diagnostic"
THROTTLED = "Passkey client diagnostic throttled"
BUCKET = "vp_passkey_client_log:unknown"


class TestPasskeyClientLogBudget(unittest.TestCase):
	"""client_log is allow_guest and writes an Error Log row per call, so an attacker
	could grow that table without bound on any string they liked. It now spends a
	per-caller budget.

	Error Log is MyISAM -- its rows survive frappe.db.rollback() -- so this test has
	to delete what it wrote or it leaks onto the live site. Everything here is scoped
	to rows created AFTER this test started: `client_log` is called by the real
	frontend (frontend/src/lib/api.ts), so deleting by title alone would destroy
	genuine diagnostics from real users. That is not hypothetical -- a debug probe
	written that way did exactly that on project.vernon.id while this test was being
	built.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		self._reset_budget()
		frappe.db.rollback()
		self._t0 = frappe.utils.now_datetime()

	def tearDown(self):
		self._reset_budget()
		frappe.db.rollback()
		frappe.db.delete("Error Log", {
			"method": ["in", [TITLE, THROTTLED]], "creation": [">=", self._t0]})
		frappe.db.commit()

	def _reset_budget(self):
		"""client_ip() returns None with no request (bench/test), so the bucket is
		"unknown" -- clear it, or a previous run's budget carries into this one and
		the assertions below come out short.

		delete_value applies make_key ITSELF, so it takes the RAW name. Passing it a
		key already run through make_key double-prefixes, deletes nothing, and fails
		silently -- which is exactly how this test first read 19 instead of 20.
		"""
		frappe.cache.delete_value(BUCKET)

	def _rows(self, title):
		return frappe.db.count("Error Log", {"method": title, "creation": [">=", self._t0]})

	def test_the_budget_bounds_what_one_caller_can_write(self):
		for i in range(passkey.CLIENT_LOG_LIMIT + 5):
			self.assertEqual(passkey.client_log(f"ZZ-passkey-probe {i}"), {"ok": True},
				"a throttled caller must not be able to tell it was throttled")
		frappe.db.commit()

		self.assertEqual(self._rows(TITLE), passkey.CLIENT_LOG_LIMIT,
			"the budget did not bound the Error Log writes")
		self.assertEqual(self._rows(THROTTLED), 1,
			"the throttle must be visible exactly once, not silent and not per-call")

	def test_a_caller_under_budget_is_still_logged(self):
		"""The guard must not break the thing the endpoint exists for."""
		passkey.client_log("ZZ-passkey-probe under budget")
		frappe.db.commit()
		self.assertEqual(self._rows(TITLE), 1)
		self.assertEqual(self._rows(THROTTLED), 0)


if __name__ == "__main__":
	unittest.main()
