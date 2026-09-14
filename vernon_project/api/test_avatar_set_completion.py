# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api.mobile import AVATAR_SETS, SET_REWARD, _grant_asset, _maybe_complete_set, buy_avatar_asset
from vernon_project.tests.no_leak import NoLeakMixin

USER = "avatar-set@test.local"
SET = "Regalia"


class TestAvatarSetCompletion(NoLeakMixin, unittest.TestCase):
	"""Buying the last item of a set grants its crest + point rebate, once.

	The rebate used to be written with source "Set", which is not a Point Ledger
	source option: frappe rejected the insert and rolled back the whole purchase,
	so no set could ever be completed."""

	def setUp(self):
		frappe.set_user("Administrator")
		for name in AVATAR_SETS[SET] + [SET_REWARD[SET][0]]:
			if not frappe.db.exists("Avatar Asset", name):
				self.skipTest(f"Avatar Asset {name!r} is not seeded on this site")
		if not frappe.db.exists("User", USER):
			frappe.get_doc({"doctype": "User", "email": USER, "first_name": "avatar-set",
				"send_welcome_email": 0}).insert(ignore_permissions=True)
		for name in AVATAR_SETS[SET][:-1]:
			_grant_asset(USER, name)
		frappe.get_doc({"doctype": "Point Ledger", "user": USER, "points_earned": 100000, "point": 100000,
			"source": "Grant", "credited_on": frappe.utils.now()}).insert(ignore_permissions=True)
		frappe.set_user(USER)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _rebates(self):
		return frappe.get_all("Point Ledger", filters={"user": USER, "source": ["!=", "Grant"]},
			fields=["source", "points_earned"])

	def test_buying_the_last_item_completes_the_set(self):
		crest, rebate = SET_REWARD[SET]
		out = buy_avatar_asset(AVATAR_SETS[SET][-1])
		self.assertEqual(out["completed"], {"set": SET, "capstone": crest, "rebate": rebate})
		self.assertTrue(frappe.db.exists("Avatar Unlock", {"user": USER, "style": "_asset", "option_value": crest}))
		# "Achievement" keeps the rebate out of crate keys (Todo only), badges and
		# the leaderboard, while it still counts toward the spendable balance.
		self.assertEqual([(r.source, r.points_earned) for r in self._rebates()], [("Achievement", rebate)])

	def test_the_rebate_is_paid_once(self):
		last = AVATAR_SETS[SET][-1]
		buy_avatar_asset(last)
		self.assertIsNone(_maybe_complete_set(USER, last))
		self.assertEqual(len(self._rebates()), 1)
