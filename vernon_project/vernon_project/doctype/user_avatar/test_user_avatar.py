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
		# ensure Administrator can afford a 5000 unlock during the test (rolled back)
		frappe.get_doc({
			"doctype": "Point Ledger", "user": USER, "role": "Assignee",
			"points_earned": PREMIUM_PRICE + 1000, "source": "Grant",
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
	"""A real uploaded profile picture must win over the DiceBear avatar config."""

	def setUp(self):
		self.user = "Administrator"
		name = frappe.db.exists("User Avatar", {"user": self.user})
		doc = frappe.get_doc("User Avatar", name) if name else frappe.new_doc("User Avatar")
		doc.user = self.user
		doc.config_json = '{"style":"lorelei","options":{}}'
		doc.snapshot = "/files/avatar-administrator.png"
		doc.save(ignore_permissions=True)

	def test_uploaded_photo_suppresses_config(self):
		# a real /files upload (not our avatar-<user> image) => config hidden
		frappe.db.set_value("User", self.user, "user_image", "/files/real-photo.png")
		self.assertIsNone(_avatar_config_map([self.user])[self.user])

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
