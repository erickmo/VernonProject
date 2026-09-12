# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from vernon_project.tests.no_leak import NoLeakMixin

REWARD = "ZZ redemption-guard reward"
REWARD2 = "ZZ redemption-guard reward alt"  # Marketplace Reward is autonamed by reward_name


def _non_sm_user():
	"""A REAL user who is not a System Manager. The guard must bind for exactly these."""
	for u in frappe.get_all("User", filters={"enabled": 1}, pluck="name", limit=200):
		if u in ("Administrator", "Guest"):
			continue
		if "System Manager" not in frappe.get_roles(u):
			return u
	return None


class TestRewardRedemptionGuards(NoLeakMixin, unittest.TestCase):
	"""The points wallet is credits - redemptions (api/mobile.py:3790), so a row here
	moves a balance. Point Ledger is System-Manager-only so points cannot be minted;
	before these guards the other half of the equation was open to Marketplace Manager
	with a controller that validated nothing:

	  * insert with point_cost = -5000 -> balance +5000, no Point Ledger row
	  * delete a real redemption       -> its debit vanishes, an unaudited refund

	Both proved live (rolled back) on 2026-09-12.

	The guards are exercised with ignore_permissions=True on purpose: that skips the
	DocPerm check and leaves ONLY the controller, which is what has to hold. It is
	also what the real risk looks like -- a Marketplace Manager genuinely holds the
	grant, so DocPerm never stops them.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		self.user = _non_sm_user()
		if not self.user:
			self.skipTest("no non-System-Manager user on this site to probe with")
		self._clean()
		self.reward = frappe.get_doc({
			"doctype": "Marketplace Reward", "reward_name": REWARD, "active": 1,
			"point_cost": 100, "stock_quantity": 5,
		}).insert(ignore_permissions=True)
		self.redemption = frappe.get_doc({
			"doctype": "Reward Redemption", "user": self.user, "reward": self.reward.name,
			"reward_name": REWARD, "point_cost": 100, "status": "Pending",
			"redeemed_on": frappe.utils.now_datetime(),
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")
		self._clean()

	def _clean(self):
		frappe.db.rollback()
		frappe.set_user("Administrator")
		# db.delete bypasses on_trash by design -- teardown must not be blocked by the
		# guard it is testing.
		frappe.db.delete("Reward Redemption", {"reward_name": ["like", "ZZ redemption-guard%"]})
		frappe.db.delete("Marketplace Reward", {"reward_name": ["like", "ZZ redemption-guard%"]})
		frappe.db.commit()

	def _reload(self):
		return frappe.get_doc("Reward Redemption", self.redemption.name)

	# --- a negative debit is a credit: refused for EVERY caller -------------------
	def test_a_negative_point_cost_is_refused_on_insert_even_for_admin(self):
		doc = frappe.get_doc({
			"doctype": "Reward Redemption", "user": self.user, "reward": self.reward.name,
			"reward_name": REWARD, "point_cost": -5000, "status": "Pending",
			"redeemed_on": frappe.utils.now_datetime(),
		})
		with self.assertRaises(frappe.ValidationError):
			doc.insert(ignore_permissions=True)

	def test_a_negative_point_cost_is_refused_on_update(self):
		doc = self._reload()
		doc.point_cost = -5000
		with self.assertRaises(frappe.ValidationError):
			doc.save(ignore_permissions=True)

	# --- what a redemption charged is fixed, for a non-System-Manager -------------
	def test_a_non_system_manager_cannot_change_point_cost(self):
		frappe.set_user(self.user)
		doc = self._reload()
		doc.point_cost = 1
		with self.assertRaises(frappe.PermissionError):
			doc.save(ignore_permissions=True)

	def test_a_non_system_manager_cannot_repoint_the_redemption_at_another_user(self):
		frappe.set_user(self.user)
		doc = self._reload()
		doc.user = "Administrator"
		with self.assertRaises(frappe.PermissionError):
			doc.save(ignore_permissions=True)

	def test_a_non_system_manager_cannot_change_the_reward(self):
		other = frappe.get_doc({
			"doctype": "Marketplace Reward", "reward_name": REWARD2, "active": 1,
			"point_cost": 7, "stock_quantity": 1,
		}).insert(ignore_permissions=True)
		frappe.set_user(self.user)
		doc = self._reload()
		doc.reward = other.name
		with self.assertRaises(frappe.PermissionError):
			doc.save(ignore_permissions=True)

	def test_a_non_system_manager_cannot_delete_a_redemption(self):
		frappe.set_user(self.user)
		with self.assertRaises(frappe.PermissionError):
			frappe.delete_doc("Reward Redemption", self.redemption.name,
				ignore_permissions=True)

	# --- the paths that MUST keep working ----------------------------------------
	def test_the_real_fulfilment_path_still_works_for_a_non_system_manager(self):
		"""frontend/src/hooks/useData.ts sends {status: "Fulfilled"} over the generic
		/api/resource PUT. That is the product's own workflow and must not break."""
		frappe.set_user(self.user)
		doc = self._reload()
		doc.status = "Fulfilled"
		doc.save(ignore_permissions=True)
		frappe.set_user("Administrator")
		fresh = self._reload()
		self.assertEqual(fresh.status, "Fulfilled")
		self.assertIsNotNone(fresh.fulfilled_on, "fulfilled_on was not stamped")

	def test_a_system_manager_can_still_correct_a_redemption(self):
		frappe.set_user("Administrator")
		doc = self._reload()
		doc.point_cost = 42
		doc.save(ignore_permissions=True)
		self.assertEqual(self._reload().point_cost, 42)

	def test_the_engine_insert_path_still_succeeds(self):
		"""api/mobile.py redeem_reward inserts with ignore_permissions=True and a
		positive cost. Pin it so a future tightening cannot strangle real redemptions.
		"""
		doc = frappe.get_doc({
			"doctype": "Reward Redemption", "user": self.user, "reward": self.reward.name,
			"reward_name": REWARD, "point_cost": 100, "status": "Pending",
			"redeemed_on": frappe.utils.now_datetime(),
		})
		doc.insert(ignore_permissions=True)
		self.assertTrue(frappe.db.exists("Reward Redemption", doc.name))


if __name__ == "__main__":
	unittest.main()
