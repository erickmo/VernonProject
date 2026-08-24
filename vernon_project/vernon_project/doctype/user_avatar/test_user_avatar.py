# Copyright (c) 2026, Vernon and contributors
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_project.api.mobile import (
	_is_free, buy_avatar_option, save_my_avatar, _my_avatar_config,
	_avatar_owned_options, PREMIUM_PRICE, _avatar_config_map,
)

USER = "Administrator"


class TestAvatarFreemium(FrappeTestCase):
	def setUp(self):
		frappe.set_user(USER)
		# ponytail: wipe live-data unlocks so premium-rejection is hermetic (rolled back)
		frappe.db.delete("Avatar Unlock", {"user": USER})
		# Ensure Administrator can afford a premium unlock during the test (rolled back).
		# Top up RELATIVE to the SPENDABLE balance the buy path actually checks — on this
		# shared live DB other tests leave penalty/redemption rows that push it negative,
		# so a fixed grant isn't enough and earned-only wouldn't match what's checked.
		# Use the RUNTIME price (a setting), not the PREMIUM_PRICE fallback constant —
		# they differ on the live site (constant 50 vs configured 5000), and the buy
		# path checks the runtime one.
		from vernon_project.api.mobile import _user_balance, _premium_price
		_, _, balance = _user_balance(USER)
		topup = _premium_price() + 1000 - float(balance)
		if topup > 0:
			frappe.get_doc({
				"doctype": "Point Ledger", "user": USER, "role": "Assignee",
				"points_earned": topup, "source": "Grant",
			}).insert(ignore_permissions=True)

	def test_is_free_boundary(self):
		self.assertTrue(_is_free("lorelei", "hair", "variant48"))   # 1st
		self.assertFalse(_is_free("lorelei", "hair", "variant10"))  # premium
		self.assertTrue(_is_free("lorelei", "skinColor", "f2d3b1")) # color always free

	def test_save_rejects_unowned_premium(self):
		with self.assertRaises(frappe.ValidationError):
			save_my_avatar('{"style":"lorelei","options":{"hair":["variant10"]}}')

	def test_save_allows_free(self):
		save_my_avatar('{"style":"lorelei","options":{"hair":["variant48"]}}')
		self.assertEqual(_my_avatar_config(USER)["options"]["hair"], ["variant48"])

	def test_buy_then_save(self):
		buy_avatar_option("lorelei", "hair", "variant10")
		self.assertIn(("lorelei", "hair", "variant10"), _avatar_owned_options(USER))
		save_my_avatar('{"style":"lorelei","options":{"hair":["variant10"]}}')  # now allowed
		self.assertEqual(_my_avatar_config(USER)["options"]["hair"], ["variant10"])

	def test_buy_free_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			buy_avatar_option("lorelei", "hair", "variant48")  # free → reject


class TestAvatarPhotoOverride(FrappeTestCase):
	"""The DiceBear avatar config wins over any uploaded profile picture."""

	def setUp(self):
		self.user = "Administrator"
		name = frappe.db.exists("User Avatar", {"user": self.user})
		doc = frappe.get_doc("User Avatar", name) if name else frappe.new_doc("User Avatar")
		doc.user = self.user
		doc.config_json = '{"style":"lorelei","options":{}}'
		doc.snapshot = "/files/avatar-administrator.png"
		doc.save(ignore_permissions=True)

	def test_avatar_config_wins_over_uploaded_photo(self):
		# The gamified avatar always wins now: even a real /files upload does NOT hide
		# the DiceBear config (behaviour reversed — see _avatar_config_map docstring).
		frappe.db.set_value("User", self.user, "user_image", "/files/real-photo.png")
		self.assertIsInstance(_avatar_config_map([self.user])[self.user], dict)

	def test_generated_snapshot_keeps_config(self):
		# identity image IS our generated avatar png => keep the live DiceBear config
		frappe.db.set_value("User", self.user, "user_image", "/files/avatar-administrator.png")
		self.assertIsInstance(_avatar_config_map([self.user])[self.user], dict)

	def test_legacy_avatar_png_keeps_config(self):
		# legacy generated names (avatar-<name>-v2.png) don't match the scrubbed email
		# but still carry the avatar- prefix => our image => keep the live config
		frappe.db.set_value("User", self.user, "user_image", "/files/avatar-legacy-v2.png")
		self.assertIsInstance(_avatar_config_map([self.user])[self.user], dict)

	def test_gravatar_keeps_config(self):
		# Frappe auto-populates a gravatar URL; it is not a real upload => keep config
		frappe.db.set_value(
			"User", self.user, "user_image", "https://secure.gravatar.com/avatar/abc?d=404&s=200")
		self.assertIsInstance(_avatar_config_map([self.user])[self.user], dict)
