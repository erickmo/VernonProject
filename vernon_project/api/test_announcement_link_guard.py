# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.announcement import save_announcement
from vernon_project.fixtures_for_tests import ensure_user


class TestAnnouncementLinkGuard(unittest.TestCase):
	"""HR Manager holds create/write on Announcement, so /api/resource reaches the
	controller without save_announcement's _clean_link. The link renders as an
	<a href> in every user's ticker."""

	HR = "an_hr@example.com"
	MSG = "linkguard-test"

	def setUp(self):
		frappe.set_user("Administrator")
		ensure_user(self.HR, "ANHR", roles=("HR Manager",))

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Announcement", filters={"message": ["like", f"{self.MSG}%"]}, pluck="name"):
			frappe.delete_doc("Announcement", name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _row(self, link):
		return {"doctype": "Announcement", "message": self.MSG, "link": link,
			"start_date": nowdate(), "end_date": add_days(nowdate(), 1), "published": 1}

	def _as_hr(self, fn, *args):
		frappe.set_user(self.HR)
		try:
			return fn(*args)
		finally:
			frappe.set_user("Administrator")

	def test_rest_insert_rejects_script_links(self):
		for link in ("javascript:alert(1)", " data:text/html,<script>alert(1)</script>",
				"https://ok.example/\njavascript:alert(1)", "\x01javascript:alert(1)"):
			with self.assertRaises(frappe.ValidationError, msg=repr(link)):
				self._as_hr(frappe.client.insert, self._row(link))
		self.assertEqual(frappe.get_all("Announcement", filters={"message": self.MSG}), [])

	def test_rest_save_rejects_script_link(self):
		doc = self._as_hr(frappe.client.insert, self._row("https://ok.example"))
		d = frappe.get_doc("Announcement", doc["name"]).as_dict()
		d["link"] = "JavaScript:alert(1)"
		with self.assertRaises(frappe.ValidationError):
			self._as_hr(frappe.client.save, d)
		self.assertEqual(frappe.db.get_value("Announcement", doc["name"], "link"), "https://ok.example")

	def test_safe_links_still_saved(self):
		doc = self._as_hr(frappe.client.insert, self._row("/app/home"))
		self.assertEqual(doc["link"], "/app/home")
		res = self._as_hr(lambda: save_announcement(message=self.MSG, start_date=nowdate(),
			end_date=add_days(nowdate(), 1), link=" https://ok.example "))
		self.assertEqual(frappe.db.get_value("Announcement", res["name"], "link"), "https://ok.example")
