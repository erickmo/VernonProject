# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.api import mobile


class TestMeetingApi(unittest.TestCase):
	def setUp(self):
		for email, first in (("api_u1@example.com", "A1"), ("api_u2@example.com", "A2")):
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
			"doctype": "Project", "project_name": "Meeting API Project",
			"brand": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [
				{"user": "Administrator"},
				{"user": "api_u1@example.com"},
				{"user": "api_u2@example.com"},
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

	def test_create_then_list(self):
		res = mobile.create_meeting(
			project=self.project.name, title="Kickoff",
			participants='["api_u1@example.com", "api_u2@example.com"]',
		)
		self.assertEqual(res["status"], "success")
		listed = mobile.list_meetings(project=self.project.name)["meetings"]
		self.assertEqual(len(listed), 1)
		self.assertEqual(listed[0]["title"], "Kickoff")
		self.assertEqual(sorted(listed[0]["participants"]), ["api_u1@example.com", "api_u2@example.com"])

	def test_invitable_users_are_team(self):
		users = mobile.meeting_invitable_users(project=self.project.name)["users"]
		emails = {u["user"] for u in users}
		self.assertIn("api_u1@example.com", emails)
		self.assertNotIn("nobody@example.com", emails)

	def test_mark_done_awards(self):
		res = mobile.create_meeting(
			project=self.project.name, title="Retro",
			participants='["api_u1@example.com"]',
		)
		name = res["name"]
		done = mobile.mark_meeting_done(meeting=name)
		self.assertEqual(done["status"], "success")
		rows = frappe.get_all("Point Ledger", filters={"meeting": name}, pluck="name")
		self.assertEqual(len(rows), 1)
