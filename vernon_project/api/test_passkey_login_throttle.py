# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""The passkey login budget must belong to the real caller, not to a header.

login_begin/login_complete are allow_guest. They used frappe's @rate_limit, which
keys on frappe.local.request_ip -- the FIRST X-Forwarded-For entry, taken with no
trusted-proxy check (frappe/auth.py:65-66). Our nginx APPENDS the peer it saw, so
a caller that sends its own X-Forwarded-For lands first and chooses its own
bucket. The limit bounded nothing.

Nothing here touches the database, so there is no fixture to isolate; the budget
lives in redis and each test clears its own buckets.
"""

import unittest

import frappe
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request

from vernon_project.api import passkey

# The peer our own nginx appended -- the one value a remote caller cannot choose.
PEER = "203.0.113.9"

# Read the limit defensively rather than as passkey.LOGIN_LIMIT: these tests
# must run against the UNFIXED module too, where that constant does not exist. A
# direct reference would die with AttributeError and look "red" for a reason that
# has nothing to do with the throttle -- which is how a test comes to be trusted
# for the wrong reason.
LIMIT = getattr(passkey, "LOGIN_LIMIT", 30)
BUCKETS = (
	f"vp_throttle:passkey_login:ip:{PEER}",
	"vp_throttle:passkey_login:ip:unknown",
	"vp_throttle:passkey_login:ip:None",
)


def _arrive_as(forged):
	"""Shape the request the way one really reaches gunicorn through our nginx:
	whatever the caller sent first, the peer nginx observed appended last."""
	frappe.local.request = Request(
		EnvironBuilder(headers={"X-Forwarded-For": f"{forged}, {PEER}"}).get_environ()
	)
	# What frappe.auth.set_request_ip would compute: the caller's own value.
	frappe.local.request_ip = forged


class TestPasskeyLoginThrottle(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self._saved = (
			getattr(frappe.local, "request", None),
			getattr(frappe.local, "request_ip", None),
		)
		self._clear()

	def tearDown(self):
		self._clear()
		frappe.local.request, frappe.local.request_ip = self._saved

	def _clear(self):
		# delete_value applies make_key itself, so it takes the RAW name. Passing a
		# key that has already been through make_key double-prefixes and silently
		# deletes nothing.
		for bucket in BUCKETS:
			frappe.cache.delete_value(bucket)

	def test_a_forged_forwarded_for_cannot_buy_a_fresh_budget(self):
		"""THE point of this file. Every call claims a different X-Forwarded-For, so
		under the old decorator every call was a new bucket and nothing ever
		throttled. The budget has to follow the peer instead."""
		with self.assertRaises(frappe.RateLimitExceededError):
			for i in range(LIMIT + 5):
				_arrive_as(f"198.51.100.{i % 251}")
				passkey.login_begin()

	def test_an_honest_caller_still_gets_the_limit_it_was_promised(self):
		"""The budget must be the number the endpoint states. The IP budget is the
		only bound here (a discoverable credential carries no username), so it must
		not be multiplied -- with IP_MULTIPLIER applied this would allow 120."""
		_arrive_as("198.51.100.7")
		for _ in range(LIMIT):
			passkey.login_begin()  # must not raise
		with self.assertRaises(frappe.RateLimitExceededError):
			passkey.login_begin()

	def test_login_complete_spends_the_same_budget(self):
		"""Otherwise the throttle guards the cheap half and leaves the half that
		does a database lookup per call unbounded."""
		_arrive_as("198.51.100.8")
		for _ in range(LIMIT):
			passkey.login_begin()
		with self.assertRaises(frappe.RateLimitExceededError):
			# Bad arguments on purpose: the budget must be spent before any of the
			# work, so this must be the throttle talking and not a parse error.
			passkey.login_complete(credential={}, handle="nope")
