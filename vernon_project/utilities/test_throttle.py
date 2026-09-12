# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.utilities import throttle
from vernon_project.utilities.throttle import enforce

BUCKETS = ("can_apply", "job_application", "start_test", "ket_items", "contact_inquiry", "zz_probe")


class TestThrottle(unittest.TestCase):
	"""Every keyed @rate_limit in this app passed a label that names no request
	parameter, so frappe's `frappe.form_dict.get(key, "")` returned "" and the identity
	collapsed to the IP -- a CLOUDFLARE EDGE address here, i.e. one bucket shared by
	every visitor behind it. submit_application was 6/hour for ALL of them.

	These assert the two properties that fix has to have: different callers must not
	share a budget, and an abuser who varies the identity must still be bounded.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		self._clear()

	def tearDown(self):
		self._clear()

	def _clear(self):
		# delete_value applies make_key itself, so it takes the RAW name.
		for b in BUCKETS:
			for scope in ("ip", "id"):
				for ident in ("unknown", "aa@x.test", "bb@x.test", "3201", "3202", "att-1", "att-2"):
					frappe.cache.delete_value(f"vp_throttle:{b}:{scope}:{ident}")

	def test_two_identities_do_not_share_a_budget(self):
		"""The bug, directly: applicant A exhausting the budget must not refuse B."""
		for _i in range(6):
			enforce("job_application", limit=6, seconds=3600, identity="3201")
		with self.assertRaises(frappe.RateLimitExceededError):
			enforce("job_application", limit=6, seconds=3600, identity="3201")

		enforce("job_application", limit=6, seconds=3600, identity="3202")  # must not throw

	def test_one_identity_is_still_bounded(self):
		for _i in range(3):
			enforce("zz_probe", limit=3, seconds=60, identity="aa@x.test")
		with self.assertRaises(frappe.RateLimitExceededError):
			enforce("zz_probe", limit=3, seconds=60, identity="aa@x.test")

	def test_varying_the_identity_is_still_bounded_by_the_ip_budget(self):
		"""Without this the fix would be WORSE than the broken decorator: that at least
		bounded per edge. A fresh identity per request must not buy unlimited calls."""
		limit, ceiling = 2, 2 * throttle.IP_MULTIPLIER
		for i in range(ceiling):
			enforce("zz_probe", limit=limit, seconds=60, identity=f"burner-{i}")
		with self.assertRaises(frappe.RateLimitExceededError):
			enforce("zz_probe", limit=limit, seconds=60, identity="burner-final")

	def test_a_caller_with_no_identity_is_bounded_by_ip_alone(self):
		limit = 2
		for _i in range(limit * throttle.IP_MULTIPLIER):
			enforce("zz_probe", limit=limit, seconds=60)
		with self.assertRaises(frappe.RateLimitExceededError):
			enforce("zz_probe", limit=limit, seconds=60)

	def test_the_endpoints_no_longer_carry_the_inert_decorator(self):
		"""Guard against someone re-adding @rate_limit(key="...") here. The label form
		is silently inert on this site; only a real parameter name would work."""
		import inspect

		from vernon_project.api import contact, recruitment

		for fn in (contact.submit_inquiry, recruitment.check_can_apply,
				recruitment.start_test, recruitment.get_ketelitian,
				recruitment.submit_application):
			src = inspect.getsource(fn)
			# A DECORATOR line, not any mention -- the call sites explain in a comment
			# why the decorator was removed, and that comment names it.
			decorators = [l.strip() for l in src.splitlines() if l.strip().startswith("@")]
			self.assertFalse(
				[d for d in decorators if d.startswith("@rate_limit")],
				f"{fn.__name__} carries an inert rate limit: {decorators}")
			self.assertIn("enforce(", src, f"{fn.__name__} spends no budget at all")


if __name__ == "__main__":
	unittest.main()
