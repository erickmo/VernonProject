# Copyright (c) 2026, Vernon and contributors
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_project.api.mobile import (
	get_avatar_catalog, save_my_avatar, _my_avatar_config, _premium_index,
)

USER = "Administrator"


def _mk_premium(name, style, slot, value, is_default=0):
	if frappe.db.exists("Avatar Item", name):
		frappe.db.set_value("Avatar Item", name, {
			"style": style, "slot": slot, "option_value": value,
			"is_default": is_default, "active": 1})
		return name
	frappe.get_doc({
		"doctype": "Avatar Item", "item_name": name, "style": style,
		"slot": slot, "option_value": value, "is_default": is_default, "active": 1,
	}).insert(ignore_permissions=True)
	return name


class TestUserAvatar(FrappeTestCase):
	def setUp(self):
		frappe.set_user(USER)
		# ponytail: silence same-triple collisions from live data; rolled back by FrappeTestCase
		for row in frappe.get_all("Avatar Item", filters={
			"style": "lorelei", "slot": "hairAccessories", "option_value": "flowers",
			"name": ["!=", "T Lorelei Flowers"],
		}, pluck="name"):
			frappe.db.set_value("Avatar Item", row, "active", 0)
		_mk_premium("T Lorelei Flowers", "lorelei", "hairAccessories", "flowers")  # premium, not owned
		_mk_premium("T Free Default Hair", "lorelei", "hair", "variant01", is_default=1)  # free/owned

	def test_premium_index_maps_triple(self):
		idx = _premium_index()
		self.assertEqual(idx.get(("lorelei", "hairAccessories", "flowers")), "T Lorelei Flowers")

	def test_catalog_marks_premium_unowned(self):
		cat = get_avatar_catalog()
		by_name = {i["name"]: i for i in cat["premium"]}
		self.assertIn("T Lorelei Flowers", by_name)
		self.assertFalse(by_name["T Lorelei Flowers"]["owned"])

	def test_save_allows_free_option(self):
		save_my_avatar('{"style":"lorelei","options":{"eyes":["variant03"]}}')
		cfg = _my_avatar_config(USER)
		self.assertEqual(cfg["style"], "lorelei")
		self.assertEqual(cfg["options"]["eyes"], ["variant03"])

	def test_save_rejects_unowned_premium(self):
		with self.assertRaises(frappe.ValidationError):
			save_my_avatar('{"style":"lorelei","options":{"hairAccessories":["flowers"]}}')

	def test_save_rejects_unknown_style(self):
		with self.assertRaises(frappe.ValidationError):
			save_my_avatar('{"style":"bogus","options":{}}')

	def test_save_survives_dangling_legacy_base_link(self):
		# Simulate a migrated row whose legacy base Link points at a now-deleted item.
		tmp = _mk_premium("T Doomed Base", "lorelei", "hair", "variant02")
		name = frappe.db.exists("User Avatar", {"user": USER}) or frappe.get_doc(
			{"doctype": "User Avatar", "user": USER}).insert(ignore_permissions=True).name
		frappe.db.set_value("User Avatar", name, "base", tmp)
		frappe.delete_doc("Avatar Item", tmp, ignore_permissions=True, force=True)  # base now dangles
		# Must NOT raise LinkValidationError:
		save_my_avatar('{"style":"lorelei","options":{}}')
		self.assertIsNone(frappe.db.get_value("User Avatar", name, "base"))

	def test_snapshot_sets_identity_image(self):
		png = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC"
			"AAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
		before = frappe.db.get_value("User", USER, "user_image") or ""
		save_my_avatar('{"style":"lorelei","options":{}}', snapshot_dataurl=png)
		img = frappe.db.get_value("User", USER, "user_image") or ""
		self.assertNotEqual(img, before)
		self.assertIn("avatar-administrator", img)
