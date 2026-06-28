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
		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Meeting Test Project",
			"brand": "Test Customer",
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


class TestMeetingPoints(MeetingTestBase):
	def setUp(self):
		super().setUp()
		if frappe.db.exists("Group", "Meeting Group"):
			frappe.delete_doc("Group", "Meeting Group", force=True, ignore_permissions=True)
		self.group = frappe.get_doc({
			"doctype": "Group",
			"group_name": "Meeting Group",
			"base_rate_per_minute": 2,
			"levels": [
				{"type_name": "Sync", "level_name": "Easy", "difficulty_percent": 50},
			],
		})
		self.group.insert(ignore_permissions=True)
		self.level_id = self.group.levels[0].level_id
		frappe.db.commit()

	def tearDown(self):
		# Delete meetings/project first: deleting a Done meeting re-fires on_change ->
		# sync_point_ledger, which needs the Group to still exist. Then clean up.
		super().tearDown()
		for pl in frappe.get_all("Point Ledger", filters={"group": self.group.name}, pluck="name"):
			frappe.delete_doc("Point Ledger", pl, force=True, ignore_permissions=True)
		frappe.delete_doc("Group", self.group.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_point_is_rate_times_minutes_times_difficulty(self):
		# 2 /min × 30 min × 50% = 30
		m = self.make_meeting(group=self.group.name, level_id=self.level_id, estimated=30)
		self.assertEqual(m.point, 30)
		self.assertEqual(m.level, "Easy")
		self.assertEqual(m.level_type, "Sync")

	def test_no_group_zero_point(self):
		m = self.make_meeting(estimated=30)
		self.assertEqual(m.point or 0, 0)


class TestMeetingTeamGuard(MeetingTestBase):
	def test_non_team_member_rejected(self):
		if not frappe.db.exists("User", "outsider@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "outsider@example.com",
				"first_name": "Out", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		with self.assertRaises(frappe.ValidationError):
			self.make_meeting(participants=["outsider@example.com"])

	def test_team_member_accepted(self):
		m = self.make_meeting(participants=["m_user1@example.com"])
		self.assertEqual(len(m.participants), 1)


class TestMeetingAward(TestMeetingPoints):
	def _ledger_for(self, meeting):
		return frappe.get_all(
			"Point Ledger",
			filters={"meeting": meeting},
			fields=["user", "points_earned", "role", "source"],
		)

	def test_done_credits_each_participant_once(self):
		m = self.make_meeting(
			group=self.group.name, level_id=self.level_id, estimated=30,
			participants=["m_user1@example.com", "m_user2@example.com"],
		)
		m.status = "✅ Done"
		m.save(ignore_permissions=True)
		rows = self._ledger_for(m.name)
		self.assertEqual(len(rows), 2)
		self.assertTrue(all(r.points_earned == 30 for r in rows))
		self.assertTrue(all(r.role == "Participant" and r.source == "Meeting" for r in rows))

	def test_resaving_done_does_not_double_credit(self):
		m = self.make_meeting(
			group=self.group.name, level_id=self.level_id, estimated=30,
			participants=["m_user1@example.com"],
		)
		m.status = "✅ Done"
		m.save(ignore_permissions=True)
		m.notes = "touch"
		m.save(ignore_permissions=True)
		self.assertEqual(len(self._ledger_for(m.name)), 1)

	def test_reopen_removes_ledger(self):
		m = self.make_meeting(
			group=self.group.name, level_id=self.level_id, estimated=30,
			participants=["m_user1@example.com"],
		)
		m.status = "✅ Done"
		m.save(ignore_permissions=True)
		m.status = "⚪️ Scheduled"
		m.save(ignore_permissions=True)
		self.assertEqual(len(self._ledger_for(m.name)), 0)


class TestMeetingPermissions(MeetingTestBase):
	def test_team_member_can_read_non_member_cannot(self):
		m = self.make_meeting(participants=["m_user1@example.com"])
		# m_user1 needs the base read role; team query conditions then scope visibility.
		mu = frappe.get_doc("User", "m_user1@example.com")
		if not any(r.role == "Project Team" for r in mu.roles):
			mu.append("roles", {"role": "Project Team"})
			mu.save(ignore_permissions=True)
		frappe.set_user("m_user1@example.com")
		names = frappe.get_list("Meeting", filters={"name": m.name}, pluck="name")
		self.assertIn(m.name, names)
		frappe.set_user("Administrator")

		if not frappe.db.exists("User", "outsider2@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "outsider2@example.com",
				"first_name": "Out2", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		# Give outsider the base read role so query conditions (not role block) do the filtering
		outsider = frappe.get_doc("User", "outsider2@example.com")
		if not any(r.role == "Project Team" for r in outsider.roles):
			outsider.append("roles", {"role": "Project Team"})
			outsider.save(ignore_permissions=True)
		frappe.set_user("outsider2@example.com")
		names = frappe.get_list("Meeting", filters={"name": m.name}, pluck="name")
		self.assertNotIn(m.name, names)
		frappe.set_user("Administrator")
