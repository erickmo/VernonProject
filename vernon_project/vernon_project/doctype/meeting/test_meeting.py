# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days


class MeetingTestBase(unittest.TestCase):
	def setUp(self):
		for email, first in (("m_user1@example.com", "M1"), ("m_user2@example.com", "M2")):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": first,
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({"doctype": "Project Group", "project_name": "Test Project Group"}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Meeting Test Project",
			"brand": "Test Customer",
			"project_group": "Test Project Group",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [
				{"user": "Administrator"},
				{"user": "m_user1@example.com"},
				{"user": "m_user2@example.com"},
			],
		})
		self.project.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Meeting", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("Meeting", name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def make_meeting(self, **kw):
		doc = frappe.get_doc({
			"doctype": "Meeting",
			"project": self.project.name,
			"title": kw.pop("title", "Standup"),
			"participants": [{"user": u} for u in kw.pop("participants", [])],
			**kw,
		})
		doc.insert(ignore_permissions=True)
		return doc


class TestMeetingBasics(MeetingTestBase):
	def test_defaults_status_and_zero_point(self):
		m = self.make_meeting()
		self.assertEqual(m.status, "⚪️ Scheduled")
		self.assertEqual(m.point or 0, 0)
		self.assertEqual(m.organizer, "Administrator")
