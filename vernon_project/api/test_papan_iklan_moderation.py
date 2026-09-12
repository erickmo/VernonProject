# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api.papan_iklan import set_status
from vernon_project.tests.no_leak import NoLeakMixin

AUTHOR = "papan-iklan-mod-probe@test.local"


class TestRemovedAdStaysRemoved(NoLeakMixin, unittest.TestCase):
	"""set_status gated WHICH status a caller may set ("Active"/"Fulfilled", with
	remove_ad reserved to admins) but never which status they set it FROM, and
	_can_manage passes for the author — so the author of an ad a moderator had
	removed could set it straight back to Active. While banned, too: create_ad and
	update_ad call _assert_not_banned, set_status does not.

	Refusing to move a Removed ad closes both, which is why there is no ban check
	in the fix — a banned author's removed ad is still Removed. The two regression
	tests pin the moderation tool itself (an admin must still be able to restore)
	and the ordinary author flow (Active -> Fulfilled).

	The ads are put into Removed the way remove_ad does it, with a direct
	set_value: remove_ad also calls _notify, which commits, and what is under test
	here is set_status.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", AUTHOR):
			frappe.get_doc({
				"doctype": "User", "email": AUTHOR, "first_name": "papan-mod-probe",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		self.ad = frappe.get_doc({
			"doctype": "Papan Iklan", "author": AUTHOR, "status": "Active",
			"title": "probe ad", "ad_type": "Sell", "contact": "probe",
		}).insert(ignore_permissions=True).name

	def tearDown(self):
		frappe.set_user("Administrator")

	def _remove(self):
		frappe.db.set_value("Papan Iklan", self.ad, "status", "Removed")

	def _status(self):
		return frappe.db.get_value("Papan Iklan", self.ad, "status")

	def test_the_author_cannot_put_a_removed_ad_back_on_the_board(self):
		self._remove()
		frappe.set_user(AUTHOR)
		with self.assertRaises(frappe.PermissionError):
			set_status(self.ad, "Active")
		frappe.set_user("Administrator")
		self.assertEqual(self._status(), "Removed")

	def test_a_banned_author_cannot_either(self):
		self._remove()
		frappe.get_doc({
			"doctype": "Papan Iklan Ban", "user": AUTHOR,
			"banned_until": frappe.utils.add_days(frappe.utils.today(), 30),
			"reason": "probe", "banned_by": "Administrator",
		}).insert(ignore_permissions=True)
		frappe.set_user(AUTHOR)
		with self.assertRaises(frappe.PermissionError):
			set_status(self.ad, "Active")
		frappe.set_user("Administrator")
		self.assertEqual(self._status(), "Removed")

	# --- REGRESSION -------------------------------------------------------------

	def test_an_admin_can_still_restore_a_removed_ad(self):
		self._remove()
		set_status(self.ad, "Active")  # Administrator holds System Manager
		self.assertEqual(self._status(), "Active")

	def test_the_author_can_still_mark_their_live_ad_fulfilled(self):
		frappe.set_user(AUTHOR)
		set_status(self.ad, "Fulfilled")
		frappe.set_user("Administrator")
		self.assertEqual(self._status(), "Fulfilled")
