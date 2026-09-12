"""Per-caller request budgets for guest-reachable endpoints.

frappe's ``@rate_limit`` is not usable on this site, for two independent reasons:

1. Its ``key=`` is the NAME of a request parameter, not a bucket label:
   ``user_key = frappe.form_dict.get(key, "")`` (frappe/rate_limiter.py:143). A
   descriptive label like ``key="can_apply"`` names no parameter, so user_key is ""
   and the identity collapses to the IP alone. Every keyed limit in this app was
   written that way and none of them bucketed per caller.
2. That IP is ``frappe.local.request_ip``, the first X-Forwarded-For entry, which on
   this site is a CLOUDFLARE EDGE address -- one bucket shared by every visitor
   behind it. www/verify.py:97-105 reached the same conclusion independently.

So: ``qr.client_ip()``, which resolves CF-Connecting-IP to the real caller, plus a
windowed counter -- the pattern already used in www/verify.py, api/attendance.py and
api/passkey.py.

TWO budgets are spent per request, because either alone is wrong:

* per business identity (an applicant's NIK, a test attempt, an email address) --
  without it, honest callers sharing one public IP behind CGNAT lock each other out,
  which is exactly what the edge bucket was doing to every applicant at once;
* per real caller IP -- without it, an abuser who simply varies the identity gets
  unlimited buckets. Dropping this would make abuse EASIER than the broken decorator
  it replaces, which did at least bound per edge.

ponytail: the two existing hand-rolled counters (verify.py, attendance.py) are left
alone -- they already work and rewriting them is not this change. New callers use
this.
"""

import frappe
from frappe import _

from vernon_project.attendance.qr import client_ip

# One office or CGNAT pool can hold a few genuine callers, so the IP budget is a
# multiple of the per-identity one: generous enough not to punish them, still bounded.
IP_MULTIPLIER = 4


def _spent(bucket, identity, limit, window):
	"""True once `identity` has spent `limit` requests on `bucket` inside `window`."""
	key = frappe.cache.make_key(f"vp_throttle:{bucket}:{identity}")
	if not frappe.cache.get(key):
		# setex stores 0; redis returns b"0", which is truthy, so the TTL is not reset
		# on later calls. delete_value takes the RAW name (it runs make_key itself).
		frappe.cache.setex(key, window, 0)
	return frappe.cache.incrby(key, 1) > limit


def enforce(bucket, limit, seconds, identity=None, ip_multiplier=IP_MULTIPLIER):
	"""Spend one request against `bucket`'s IP and identity budgets, or throw.

	`identity` is the business identity when the request carries one (NIK, attempt id,
	email). When it is absent the IP budget still bounds the caller.

	`ip_multiplier` exists because the multiplier is only correct when there are TWO
	budgets: it stops an office or CGNAT pool tripping the per-identity limit for
	everyone. On an endpoint with no business identity the IP budget is the ONLY
	bound, and multiplying it silently loosens the stated limit (30/min would admit
	120/min). Such callers pass ip_multiplier=1 so the number they ask for is the
	number they get.
	"""
	if _spent(f"{bucket}:ip", client_ip() or "unknown", limit * ip_multiplier, seconds):
		_too_many()
	identity = (identity or "").strip().lower()
	if identity and _spent(f"{bucket}:id", identity, limit, seconds):
		_too_many()


def _too_many():
	frappe.throw(
		_("Terlalu banyak permintaan. Coba lagi beberapa saat lagi."),
		frappe.RateLimitExceededError,
	)
