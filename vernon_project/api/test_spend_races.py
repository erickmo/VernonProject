# Copyright (c) 2026, Vernon and contributors
# See license.txt

import threading
import unittest

import frappe

from vernon_project.api.mobile import _user_balance, gift_points

SENDER = "spend-race-sender@test.local"
RECIPIENT = "spend-race-recipient@test.local"


class TestSpendRaces(unittest.TestCase):
	"""This bench runs REPEATABLE READ: a request's plain reads see the snapshot its
	first read took. Every point spend checked the balance with plain reads (the
	vernon_spend get_lock doesn't help: it's released before the request commits, and
	it can't refresh a snapshot). So a second spend whose request had already read
	anything before the first one committed still saw the old balance and spent it
	again -- a user could redeem, gift or buy beyond what they have."""

	def setUp(self):
		frappe.set_user("Administrator")
		for email in (SENDER, RECIPIENT):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.get_doc({"doctype": "Point Ledger", "user": SENDER, "points_earned": 100, "point": 100,
			"source": "Grant", "credited_on": frappe.utils.now()}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.db.rollback()  # drop any pinned snapshot before cleaning up
		frappe.set_user("Administrator")
		frappe.db.delete("Point Ledger", {"user": ["in", [SENDER, RECIPIENT]]})
		frappe.db.delete("Vernon Notification", {"recipient": ["in", [SENDER, RECIPIENT]]})
		frappe.db.commit()

	def _spend_in_another_session(self, fn):
		site = frappe.local.site

		def run():
			frappe.init(site=site)
			frappe.connect()
			try:
				frappe.set_user(SENDER)
				fn()
				frappe.db.commit()
			finally:
				frappe.destroy()

		t = threading.Thread(target=run)
		t.start()
		t.join(30)

	def test_the_locking_balance_read_sees_a_spend_committed_after_the_snapshot(self):
		frappe.set_user(SENDER)
		self.assertEqual(_user_balance(SENDER)[2], 100)  # pins this transaction's snapshot
		self._spend_in_another_session(lambda: gift_points(RECIPIENT, 100))
		self.assertEqual(_user_balance(SENDER)[2], 100, "plain read: still the old snapshot")
		self.assertEqual(_user_balance(SENDER, for_update=True)[2], 0)

	def test_a_gift_cannot_spend_the_same_points_twice(self):
		frappe.set_user(SENDER)
		_user_balance(SENDER)  # any earlier read in the request pins the snapshot
		self._spend_in_another_session(lambda: gift_points(RECIPIENT, 100))
		with self.assertRaises(frappe.ValidationError):
			gift_points(RECIPIENT, 100)
		frappe.db.rollback()
		self.assertEqual(_user_balance(SENDER)[2], 0)
