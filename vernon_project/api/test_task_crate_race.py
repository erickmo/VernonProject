# Copyright (c) 2026, Vernon and contributors
# See license.txt

import threading
import unittest

import frappe

from vernon_project.api.mobile import CRATE_KEY_COST, _crate_opened_total, open_task_crate

USER = "crate-race@test.local"


class TestTaskCrateRace(unittest.TestCase):
	"""open_task_crate released its get_lock before the request committed, and this
	bench runs REPEATABLE READ. A second open whose snapshot predated the first one's
	commit still counted the key as unspent, granted another cosmetic, and its
	key-index claim then collided and was silently ignored: one key, two cosmetics.

	Not on NoLeakMixin: the race needs a second connection that really commits, so
	tearDown deletes this user's rows by name (same as test_spend_races)."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", USER):
			frappe.get_doc({"doctype": "User", "email": USER, "first_name": "crate-race",
				"send_welcome_email": 0}).insert(ignore_permissions=True)
		self._cleanup()
		# Exactly one key.
		frappe.get_doc({"doctype": "Point Ledger", "user": USER, "points_earned": CRATE_KEY_COST,
			"point": CRATE_KEY_COST, "source": "Todo", "credited_on": frappe.utils.now()}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.db.rollback()  # drop any pinned snapshot before cleaning up
		frappe.set_user("Administrator")
		self._cleanup()

	def _cleanup(self):
		for doctype in ("Point Ledger", "Avatar Unlock", "Avatar Reward Claim"):
			frappe.db.delete(doctype, {"user": USER})
		frappe.db.commit()

	def _open_in_another_session(self):
		site, errors = frappe.local.site, []

		def run():
			frappe.init(site=site)
			frappe.connect()
			try:
				frappe.set_user(USER)
				open_task_crate()
				frappe.db.commit()
			except Exception as e:
				errors.append(e)
			finally:
				frappe.destroy()

		t = threading.Thread(target=run)
		t.start()
		t.join(30)
		self.assertEqual(errors, [], "the other session's open must succeed")

	def test_one_key_opens_one_crate_even_from_an_old_snapshot(self):
		frappe.set_user(USER)
		self.assertEqual(_crate_opened_total(USER), 0)  # pins this transaction's snapshot
		self._open_in_another_session()
		opened = frappe.db.sql(
			"select count(*) from `tabAvatar Reward Claim` where user=%s and claim_type='task_crate' for update", USER
		)[0][0]
		self.assertEqual(opened, 1, "the other session spent the only key")
		with self.assertRaises(frappe.ValidationError):
			open_task_crate()
		frappe.db.rollback()
		self.assertEqual(frappe.db.count("Avatar Unlock", {"user": USER}), 1, "one key, one cosmetic")
