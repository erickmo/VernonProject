# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.project import get_project_team_members
from vernon_project.vernon_project.doctype.project.project import user_with_role_query
from vernon_project.api.report import assignment_overload_check
from vernon_project.api.mobile import get_member_workload
from vernon_project.tests.no_leak import NoLeakMixin


class TestLowSeverityScope(NoLeakMixin, unittest.TestCase):
	"""2026-09-08 permission sweep, low-severity group: get_project_team_members,
	user_with_role_query, assignment_overload_check, get_member_workload's
	target-membership gap."""

	LEADER = "lss_leader@example.com"
	TEAMMATE = "lss_teammate@example.com"
	STRANGER = "lss_stranger@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		for email in (self.LEADER, self.TEAMMATE, self.STRANGER):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", self.LEADER)
		have = {r.role for r in u.roles}
		for role in ("Project Owner", "Project Leader"):
			if role not in have:
				u.append("roles", {"role": role})
		u.save(ignore_permissions=True)
		# "Project Team" doctype-level role — needed for _visible_projects()
		# (frappe.get_list) to grant read on Project itself, same two-layer
		# shape hit twice already tonight.
		for email in (self.TEAMMATE, self.STRANGER):
			u2 = frappe.get_doc("User", email)
			if not any(r.role == "Project Team" for r in u2.roles):
				u2.append("roles", {"role": "Project Team"})
				u2.save(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "LSS Project", "brand": "Test Customer",
			"project_owner": self.LEADER, "project_leader": self.LEADER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.TEAMMATE}],
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	# ---- get_project_team_members ----

	def test_get_project_team_members_outsider_refused_leader_sees_roster(self):
		frappe.set_user(self.STRANGER)
		try:
			self.assertEqual(get_project_team_members(self.project.name), [])
		finally:
			frappe.set_user("Administrator")

		frappe.set_user(self.LEADER)
		try:
			members = get_project_team_members(self.project.name)
		finally:
			frappe.set_user("Administrator")
		self.assertIn(self.TEAMMATE, members)

	# ---- user_with_role_query ----

	def test_user_with_role_query_allowlisted_role_only(self):
		result = user_with_role_query("User", "", "name", 0, 20, {"role": "HR Manager"})
		self.assertEqual(result, [])  # not an allowlisted role for this picker
		result2 = user_with_role_query("User", "", "name", 0, 20, {"role": "Project Owner"})
		names = {r[0] for r in result2}
		self.assertIn(self.LEADER, names)  # legitimate use still works

	# ---- assignment_overload_check ----

	def test_assignment_overload_check_stranger_refused_leader_succeeds(self):
		frappe.set_user(self.STRANGER)
		try:
			with self.assertRaises(frappe.PermissionError):
				assignment_overload_check(self.TEAMMATE, nowdate(), 60)
		finally:
			frappe.set_user("Administrator")

		frappe.set_user(self.LEADER)
		try:
			r = assignment_overload_check(self.TEAMMATE, nowdate(), 60)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(r["user"], self.TEAMMATE)

	# ---- get_member_workload: the actual new check (caller sees the project,
	# but the named user isn't a member of it) ----

	def test_get_member_workload_refuses_a_non_member_even_when_project_is_visible(self):
		frappe.set_user(self.LEADER)  # can see the project (owns it)
		try:
			with self.assertRaises(frappe.PermissionError):
				get_member_workload(self.project.name, self.STRANGER)  # STRANGER isn't on it
			rows = get_member_workload(self.project.name, self.TEAMMATE)  # real member
			self.assertIsInstance(rows, list)
		finally:
			frappe.set_user("Administrator")


class TestFoodInviteSelfEnrollScope(NoLeakMixin, unittest.TestCase):
	"""food_invite.respond()'s self-enroll must only fire for Link-audience
	invites — a Specific/Internal/Project invite's recipient list is supposed
	to be closed."""

	OUTSIDER = "lss_food_outsider@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", self.OUTSIDER):
			frappe.get_doc({
				"doctype": "User", "email": self.OUTSIDER, "first_name": "LSS Food Outsider",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
			frappe.db.commit()
		self.doc = frappe.get_doc({
			"doctype": "Food Invite", "inviter": "Administrator",
			"message": "LSS test invite", "order_by": add_days(frappe.utils.now_datetime(), 1),
			"audience_type": "Specific",
			"recipients": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Food Invite", self.doc.name):
			frappe.delete_doc("Food Invite", self.doc.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_uninvited_user_cannot_self_enroll_into_a_specific_invite(self):
		from vernon_project.api.food_invite import respond
		frappe.set_user(self.OUTSIDER)
		try:
			with self.assertRaises(frappe.PermissionError):
				respond(self.doc.name, "Yes")
		finally:
			frappe.set_user("Administrator")
		self.assertFalse(frappe.db.exists(
			"Food Invite Recipient", {"parent": self.doc.name, "user": self.OUTSIDER},
		))
