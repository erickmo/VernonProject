# Copyright (c) 2026, Vernon and contributors
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_project.api.mobile import (
	_avatar_owned_items, get_avatar_catalog, save_my_avatar, _my_avatar_config,
)

USER = "Administrator"


def _mk_item(name, slot, is_default=0, socket=None):
	if frappe.db.exists("Avatar Item", name):
		return name
	frappe.get_doc({
		"doctype": "Avatar Item", "item_name": name, "slot": slot,
		"is_default": is_default, "active": 1, "socket": socket,
		"model_url": f"/assets/vernon_project/models/{name}.glb",
	}).insert(ignore_permissions=True)
	return name


class TestUserAvatar(FrappeTestCase):
	def setUp(self):
		frappe.set_user(USER)
		_mk_item("T Human", "Base", is_default=1)
		_mk_item("T Cap", "Hat", is_default=1, socket="head_top")
		_mk_item("T Crown", "Hat", socket="head_top")  # not default → locked

	def test_default_items_are_owned(self):
		owned = _avatar_owned_items(USER)
		self.assertIn("T Human", owned)
		self.assertIn("T Cap", owned)
		self.assertNotIn("T Crown", owned)

	def test_catalog_marks_locked_item(self):
		cat = get_avatar_catalog()
		by_name = {i["name"]: i for i in cat["items"]}
		self.assertIn("T Human", by_name)
		self.assertIn("T Crown", by_name)
		self.assertTrue(by_name["T Human"]["owned"])
		self.assertFalse(by_name["T Crown"]["owned"])

	def test_save_rejects_unowned(self):
		with self.assertRaises(frappe.ValidationError):
			save_my_avatar({"base": "T Human", "hat": "T Crown"})

	def test_save_rejects_slot_mismatch(self):
		with self.assertRaises(frappe.ValidationError):
			save_my_avatar({"base": "T Cap"})  # Cap is a Hat, not a Base

	def test_save_happy_path_persists(self):
		save_my_avatar({"base": "T Human", "hat": "T Cap", "skin_color": "#112233"})
		cfg = _my_avatar_config(USER)
		self.assertEqual(cfg["base"], "T Human")
		self.assertEqual(cfg["hat"], "T Cap")
		self.assertEqual(cfg["skin_color"], "#112233")

	def test_snapshot_sets_identity_image(self):
		# 1x1 transparent PNG
		png = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC"
			"AAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
		before = frappe.db.get_value("User", USER, "user_image") or ""
		save_my_avatar({"base": "T Human"}, snapshot_dataurl=png)
		img = frappe.db.get_value("User", USER, "user_image") or ""
		self.assertNotEqual(img, before)
		self.assertIn("avatar-administrator", img)
