# Copyright (c) 2026, Vernon and contributors
# See license.txt

import hashlib
import threading
import unittest

import frappe

from vernon_project.api import midtrans
from vernon_project.api.events import _apply_notification

USER = "midtrans-race@test.local"
TITLE = "ZZ midtrans-race event"
SERVER_KEY = "ZZ-test-server-key"
AMOUNT = 50000.0


def _payload(order_id, transaction_status, fraud_status=None):
	"""A genuinely-signed Midtrans notification, exactly as verify_signature checks it."""
	status_code = "200"
	gross_amount = f"{AMOUNT:.2f}"
	raw = f"{order_id}{status_code}{gross_amount}{SERVER_KEY}"
	body = {
		"order_id": order_id,
		"status_code": status_code,
		"gross_amount": gross_amount,
		"transaction_status": transaction_status,
		"signature_key": hashlib.sha512(raw.encode()).hexdigest(),
	}
	if fraud_status:
		body["fraud_status"] = fraud_status
	return body


class TestMidtransNotificationRace(unittest.TestCase):
	"""This bench runs REPEATABLE READ: a request's plain reads return the snapshot its
	FIRST read took. _apply_notification row-locks the registration and then re-reads it
	with a plain get_doc, so the `if reg.status == "Confirmed"` short-circuit — and the
	terminal-state protection it provides — is evaluated against the world as it was
	BEFORE the lock. Two notifications for one order processed concurrently is precisely
	what the lock exists for, so the loser walks straight past the guard.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		self._real_server_key = midtrans._server_key
		midtrans._server_key = lambda: SERVER_KEY

		if not frappe.db.exists("User", USER):
			frappe.get_doc({
				"doctype": "User", "email": USER, "first_name": "Midtrans Race",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		self.event = frappe.get_doc({
			"doctype": "Vernon Event", "title": TITLE, "status": "Published",
			"pricing": "Rupiah", "price": AMOUNT,
			"start_datetime": frappe.utils.add_days(frappe.utils.nowdate(), 7) + " 09:00:00",
		}).insert(ignore_permissions=True)
		self.reg = frappe.get_doc({
			"doctype": "Vernon Event Registration", "event": self.event.name, "user": USER,
			"method": "Rupiah", "amount": AMOUNT, "status": "Pending",
			"registered_on": frappe.utils.now_datetime(),
		}).insert(ignore_permissions=True)
		self.reg.db_set("midtrans_order_id", self.reg.name)
		frappe.db.commit()

	def tearDown(self):
		midtrans._server_key = self._real_server_key
		frappe.db.rollback()  # drop any pinned snapshot before cleaning up
		frappe.set_user("Administrator")
		frappe.db.delete("Vernon Event Registration", {"event": self.event.name})
		frappe.db.delete("Vernon Event", {"title": TITLE})
		# This runs against a LIVE site, so take the probe user back out too. It is
		# created with no password and no welcome email, but a test account left
		# enabled on prod is a standing hazard, not a tidiness point.
		if frappe.db.exists("User", USER):
			frappe.delete_doc("User", USER, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _in_another_session(self, fn):
		"""Run fn on an independent connection that COMMITS, and return its result.
		Reads go through here too: this session's snapshot is pinned on purpose, so it
		cannot see what the other session committed."""
		site = frappe.local.site
		out, err = [], []

		def run():
			frappe.init(site=site)
			frappe.connect()
			try:
				frappe.set_user("Administrator")
				midtrans._server_key = lambda: SERVER_KEY
				out.append(fn())
				frappe.db.commit()
			except Exception as e:  # surface it instead of a silent no-op
				err.append(repr(e))
			finally:
				frappe.destroy()

		t = threading.Thread(target=run)
		t.start()
		t.join(30)
		self.assertEqual(err, [], "the other session failed")
		return out[0] if out else None

	def _notify_in_another_session(self, payload):
		"""Deliver a notification on an independent connection — the concurrent
		duplicate this endpoint is documented to expect."""
		self._in_another_session(lambda: _apply_notification(payload))

	def _committed(self, field):
		"""Read a committed value without disturbing this session's pinned snapshot."""
		return self._in_another_session(
			lambda: frappe.db.get_value("Vernon Event Registration", self.reg.name, field))

	def _status(self):
		frappe.db.rollback()  # fresh snapshot, so we read what is actually committed
		return frappe.db.get_value("Vernon Event Registration", self.reg.name, "status")

	def test_the_relock_read_sees_a_confirmation_committed_after_the_snapshot(self):
		"""The mechanism, in isolation: after the lock, the plain read is stale and the
		locking read is not. This is what makes the guard below unreachable."""
		frappe.db.get_value("Vernon Event Registration", self.reg.name, "status")  # pins the snapshot
		self._notify_in_another_session(_payload(self.reg.name, "settlement"))

		frappe.db.get_value("Vernon Event Registration", self.reg.name, "name", for_update=True)
		self.assertEqual(
			frappe.get_doc("Vernon Event Registration", self.reg.name).status,
			"Pending",
			"plain get_doc after the lock: still the pre-lock snapshot",
		)
		self.assertEqual(
			frappe.get_doc("Vernon Event Registration", self.reg.name, for_update=True).status,
			"Confirmed",
		)

	def test_a_cancel_racing_a_settlement_cannot_unconfirm_a_paid_registration(self):
		"""A `cancel`/`expire` delivered concurrently with the `settlement` must not
		overwrite a registration that is already paid and Confirmed."""
		frappe.db.get_value("Vernon Event Registration", self.reg.name, "status")  # pins the snapshot
		self._notify_in_another_session(_payload(self.reg.name, "settlement"))

		_apply_notification(_payload(self.reg.name, "cancel"))
		frappe.db.commit()
		self.assertEqual(self._status(), "Confirmed", "a paid registration was cancelled")

	def test_a_duplicate_settlement_short_circuits_instead_of_re_finalising(self):
		"""The documented idempotency: the second settlement must return early on the
		already-Confirmed row rather than re-running the finalise branch."""
		frappe.db.get_value("Vernon Event Registration", self.reg.name, "status")  # pins the snapshot
		self._notify_in_another_session(_payload(self.reg.name, "settlement"))
		paid_on = self._committed("paid_on")  # what the winner stamped, read fresh
		self.assertIsNotNone(paid_on, "the winning settlement did not stamp paid_on")

		self.assertEqual(_apply_notification(_payload(self.reg.name, "settlement")), "Confirmed")
		frappe.db.commit()
		self.assertEqual(self._status(), "Confirmed")
		self.assertEqual(
			frappe.db.get_value("Vernon Event Registration", self.reg.name, "paid_on"),
			paid_on,
			"the duplicate re-stamped paid_on instead of short-circuiting",
		)
