# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api import mobile


class TestMeetingPermissionBoundary(unittest.TestCase):
	"""2026-09-09 permission sweep (6gb7lcr41q follow-up): _meeting_can_manage()
	(mobile.py) gates update_meeting/delete_meeting/set_meeting_participants/
	mark_meeting_done/reopen_meeting -- correctly implemented (is_sm or user in
	organizer/project_owner/project_leader, or a project admin) but had ZERO
	test coverage anywhere in the repo (grepped every test_*.py). A future
	regression here (e.g. widening the check, or an early return that skips
	it) would ship silently. This proves the boundary through the real
	whitelisted endpoints, not just the helper in isolation.

	create_meeting only lets Owner/Leader/Admin create a meeting, so a fresh
	meeting's organizer is always privileged at creation time -- there's no
	way through the real API to get an organizer who is "merely" a plain team
	member. The organizer-fallback branch only matters for someone who WAS
	leader/owner/admin when they created it and lost that role afterward
	(reassigned leadership, demoted). test_demoted_organizer_can_still_manage_own_meeting
	models that real scenario instead of an unreachable one."""

	LEADER = "mpb_leader@example.com"
	TEAMMATE = "mpb_teammate@example.com"
	OUTSIDER = "mpb_outsider@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		for email in (self.LEADER, self.TEAMMATE, self.OUTSIDER):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		# Project.validate_lead_roles() requires the Project Leader role on
		# whoever is set as project_leader (same requirement documented in
		# test_ptype_blind_permission.py's setUp).
		leader_doc = frappe.get_doc("User", self.LEADER)
		if not any(r.role == "Project Leader" for r in leader_doc.roles):
			leader_doc.append("roles", {"role": "Project Leader"})
			leader_doc.save(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Meeting Perm Boundary Project",
			"brand": "Test Customer",
			"project_owner": "Administrator", "project_leader": self.LEADER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [
				{"user": "Administrator"}, {"user": self.LEADER}, {"user": self.TEAMMATE},
			],
		})
		self.project.insert(ignore_permissions=True)
		frappe.db.commit()
		# Created as Administrator (project_owner) so organizer == "Administrator",
		# who stays privileged for the whole test -- isolates the owner/leader/
		# admin branch of the gate from the organizer-fallback branch (tested
		# separately below with its own dedicated fixture).
		res = mobile.create_meeting(
			project=self.project.name, title="Boundary Test Meeting",
			participants=f'["{self.TEAMMATE}"]',
		)
		self.assertEqual(res["status"], "success", res)
		self.meeting = res["name"]

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Meeting", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("Meeting", name, force=True, ignore_permissions=True)
		# Same on_change() re-mint quirk documented in test_meeting_api.py's tearDown.
		frappe.db.delete("Point Ledger", {"project": self.project.name})
		frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_outsider_cannot_update(self):
		frappe.set_user(self.OUTSIDER)
		try:
			res = mobile.update_meeting(meeting=self.meeting, title="Hijacked")
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "error")
		self.assertEqual(frappe.db.get_value("Meeting", self.meeting, "title"), "Boundary Test Meeting")

	def test_outsider_cannot_delete(self):
		frappe.set_user(self.OUTSIDER)
		try:
			res = mobile.delete_meeting(meeting=self.meeting)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "error")
		self.assertTrue(frappe.db.exists("Meeting", self.meeting))

	def test_plain_team_member_cannot_delete_someone_elses_meeting(self):
		"""Project Team membership alone is NOT enough -- only the organizer,
		project owner/leader, or a project admin may manage a meeting."""
		frappe.set_user(self.TEAMMATE)
		try:
			res = mobile.delete_meeting(meeting=self.meeting)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "error")
		self.assertTrue(frappe.db.exists("Meeting", self.meeting))

	def test_project_leader_can_delete_others_meeting(self):
		frappe.set_user(self.LEADER)
		try:
			res = mobile.delete_meeting(meeting=self.meeting)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "success")
		self.assertFalse(frappe.db.exists("Meeting", self.meeting))

	def test_demoted_organizer_can_still_manage_own_meeting(self):
		"""LEADER creates a meeting while actually project_leader (organizer=
		LEADER), then leadership moves to someone else. LEADER is now just a
		plain team member by role, but the organizer-fallback branch of
		_meeting_can_manage should still let them manage the meeting THEY
		created."""
		frappe.set_user(self.LEADER)
		res = mobile.create_meeting(
			project=self.project.name, title="Leader's Own Meeting",
			participants=f'["{self.TEAMMATE}"]',
		)
		frappe.set_user("Administrator")
		self.assertEqual(res["status"], "success", res)
		own_meeting = res["name"]
		self.assertEqual(frappe.db.get_value("Meeting", own_meeting, "organizer"), self.LEADER)

		# Demote: leadership moves to Administrator, LEADER is now a plain
		# team member on this project.
		self.project.reload()
		self.project.project_leader = "Administrator"
		self.project.save(ignore_permissions=True)

		frappe.set_user(self.LEADER)
		try:
			res = mobile.update_meeting(meeting=own_meeting, title="Still mine to edit")
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "success", res)
		self.assertEqual(frappe.db.get_value("Meeting", own_meeting, "title"), "Still mine to edit")

		# But TEAMMATE (never organizer, never leader) is still denied on it.
		frappe.set_user(self.TEAMMATE)
		try:
			res = mobile.delete_meeting(meeting=own_meeting)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "error")
		self.assertTrue(frappe.db.exists("Meeting", own_meeting))
