# Copyright (c) 2026, Vernon and contributors
"""The /verify page's throttle. It was a decorator factory called as a bare statement
inside `except Exception: pass` — it built a decorator, applied it to nothing, and threw
it away, so the public page had no throttle at all and the bare except made sure nobody
would notice. These tests fail against that version."""

import unittest
from unittest.mock import patch

import frappe

from vernon_project.www import verify


class TestVerifyLookupRateLimit(unittest.TestCase):
	IP = "203.0.113.77"

	def setUp(self):
		frappe.set_user("Administrator")
		self._key = frappe.cache.make_key(f"vp_verify_lookup:{self.IP}")
		frappe.cache.delete(self._key)
		frappe.form_dict = frappe._dict()

	def tearDown(self):
		frappe.cache.delete(self._key)
		frappe.form_dict = frappe._dict()

	def _render(self, code="somecode"):
		frappe.form_dict = frappe._dict({"code": code, "lang": "en"})
		return verify.get_context(frappe._dict())

	def test_lookups_are_throttled_once_the_budget_is_spent(self):
		with patch.object(verify, "client_ip", return_value=self.IP), \
			 patch.object(verify, "lookup_verify", return_value={"state": "not_found"}):
			for i in range(verify.LOOKUP_LIMIT):
				self._render()  # the allowance, all fine
			with self.assertRaises(frappe.RateLimitExceededError):
				self._render()  # one past it

	def test_the_counter_is_per_caller_not_global(self):
		"""frappe's @rate_limit keys on request_ip, a Cloudflare EDGE address here, so
		it would bucket unrelated visitors together. A second caller must start fresh."""
		other = "198.51.100.9"
		other_key = frappe.cache.make_key(f"vp_verify_lookup:{other}")
		frappe.cache.delete(other_key)
		try:
			with patch.object(verify, "lookup_verify", return_value={"state": "not_found"}):
				with patch.object(verify, "client_ip", return_value=self.IP):
					for _i in range(verify.LOOKUP_LIMIT + 1):
						try:
							self._render()
						except frappe.RateLimitExceededError:
							pass
				with patch.object(verify, "client_ip", return_value=other):
					self._render()  # must NOT raise — different caller, own budget
		finally:
			frappe.cache.delete(other_key)

	def test_a_visit_without_a_code_costs_nothing(self):
		"""Opening /verify with no code is not a lookup and must not spend the budget."""
		with patch.object(verify, "client_ip", return_value=self.IP), \
			 patch.object(verify, "lookup_verify", return_value={"state": "not_found"}):
			for _i in range(verify.LOOKUP_LIMIT + 5):
				self._render(code="")
		self.assertFalse(frappe.cache.get(self._key), "an empty code must not be counted")


if __name__ == "__main__":
	unittest.main()
