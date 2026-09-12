# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api.mobile import gift_points

SENDER = "gift-lock-sender@test.local"
RECIPIENT = "gift-lock-recipient@test.local"


class TestGiftPointsLocksBothParties(unittest.TestCase):
	"""gift_points writes a Point Ledger row for BOTH parties but used to take a
	locking read on the SENDER only. Two users gifting each other at the same
	moment therefore deadlocked — each transaction held its own sender's ledger
	range and then reached into the other's (reproduced live: MariaDB 1213).

	Testing this deterministically needs care. Holding the recipient's ledger
	range and then making a NORMAL gift proves nothing: the endpoint blocks
	either way, because even locking only the sender it still has to INSERT the
	recipient's row into that same held range. That version of this test passed
	against the unfixed code.

	So the gift here asks for MORE than the sender has. The balance check is the
	fork: if both parties are locked UP FRONT in canonical order — which is what
	makes the deadlock impossible — the call blocks on the recipient's lock and
	times out before it ever reaches that check. Locking only the sender, it
	reaches the check and returns "Not enough points" with no wait at all.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		for email in (SENDER, RECIPIENT):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		frappe.get_doc({
			"doctype": "Point Ledger", "user": SENDER, "points_earned": 50, "point": 50,
			"source": "Grant", "credited_on": frappe.utils.now(),
		}).insert(ignore_permissions=True)
		# the recipient needs a row of its own, so the range we lock below exists
		frappe.get_doc({
			"doctype": "Point Ledger", "user": RECIPIENT, "points_earned": 1, "point": 1,
			"source": "Grant", "credited_on": frappe.utils.now(),
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.db.rollback()
		frappe.set_user("Administrator")
		frappe.db.delete("Point Ledger", {"user": ["in", [SENDER, RECIPIENT]]})
		frappe.db.delete("Vernon Notification", {"recipient": ["in", [SENDER, RECIPIENT]]})
		frappe.db.commit()

	def _independent_conn(self):
		import pymysql

		conf = frappe.conf
		c = pymysql.connect(
			host=conf.db_host or "127.0.0.1", port=int(conf.db_port or 3306),
			user=conf.db_name, password=conf.db_password, database=conf.db_name,
			autocommit=False,
		)
		return c, c.cursor()

	def test_the_recipient_is_locked_before_the_balance_check(self):
		conn, cur = self._independent_conn()
		try:
			cur.execute("start transaction")
			cur.execute(
				"select name from `tabPoint Ledger` where user=%s for update", (RECIPIENT,)
			)
			cur.fetchall()  # the recipient's ledger range is now held elsewhere

			frappe.set_user(SENDER)
			frappe.db.sql("set session innodb_lock_wait_timeout = 3")
			# 500 > the sender's 50, so an unlocked path short-circuits here.
			with self.assertRaises(Exception) as ctx:
				gift_points(RECIPIENT, 500)
			msg = str(ctx.exception).lower()
			self.assertNotIn(
				"not enough points", msg,
				"gift_points reached the balance check without locking the recipient — "
				"it writes a ledger row for them, so both parties must be locked up "
				"front in a canonical order or mutual gifts deadlock.",
			)
			self.assertIn("lock wait timeout", msg)
		finally:
			conn.rollback()
			conn.close()
			frappe.db.rollback()

	def test_a_normal_gift_still_works(self):
		# Positive control: the lock must not break the ordinary path.
		frappe.set_user(SENDER)
		res = gift_points(RECIPIENT, 5)
		self.assertEqual(res["gifted"], 5)
		self.assertEqual(res["to"], RECIPIENT)
		self.assertEqual(res["balance"], 45.0)
