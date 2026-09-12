# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, now_datetime

from vernon_project.api.food_invite import get_invite
from vernon_project.tests.no_leak import NoLeakMixin


class TestFoodInviteGetInviteScope(NoLeakMixin, unittest.TestCase):
	"""2026-09-09 permission sweep: get_invite(invite) had no ownership or
	recipient check at all -- any logged-in user who knew or guessed an
	invite's name could read a Specific-audience invite's full content
	(message, place, who's coming). respond() already checked recipient
	membership; get_invite() didn't. Fixed with a shared _can_view() gate:
	inviter, an actual recipient, or (Link audience only, by design --
	that's how you decide whether to join) anyone."""

	INVITER = "figs_inviter@example.com"
	RECIPIENT = "figs_recipient@example.com"
	STRANGER = "figs_stranger@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		for email in (self.INVITER, self.RECIPIENT, self.STRANGER):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		self.specific = frappe.get_doc({
			"doctype": "Food Invite", "inviter": self.INVITER, "message": "Ayo makan!",
			"audience_type": "Specific", "order_by": add_days(now_datetime(), 1),
			"recipients": [{"user": self.RECIPIENT}],
		}).insert(ignore_permissions=True)
		self.link_invite = frappe.get_doc({
			"doctype": "Food Invite", "inviter": self.INVITER, "message": "Link invite",
			"audience_type": "Link", "order_by": add_days(now_datetime(), 1),
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for doc in (self.specific, self.link_invite):
			if frappe.db.exists("Food Invite", doc.name):
				frappe.delete_doc("Food Invite", doc.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_stranger_cannot_read_a_specific_audience_invite(self):
		frappe.set_user(self.STRANGER)
		try:
			with self.assertRaises(frappe.PermissionError):
				get_invite(self.specific.name)
		finally:
			frappe.set_user("Administrator")

	def test_recipient_and_inviter_can_read_it(self):
		frappe.set_user(self.RECIPIENT)
		try:
			self.assertEqual(get_invite(self.specific.name)["name"], self.specific.name)
		finally:
			frappe.set_user("Administrator")
		frappe.set_user(self.INVITER)
		try:
			self.assertEqual(get_invite(self.specific.name)["name"], self.specific.name)
		finally:
			frappe.set_user("Administrator")

	def test_anyone_can_read_a_link_invite_before_joining(self):
		frappe.set_user(self.STRANGER)
		try:
			self.assertEqual(get_invite(self.link_invite.name)["name"], self.link_invite.name)
		finally:
			frappe.set_user("Administrator")
