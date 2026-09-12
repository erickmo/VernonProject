# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api.project_roles import bulk_assign_project_roles
from vernon_project.tests.no_leak import NoLeakMixin

ATTACKER = "bulk-role-attacker@test.local"
OWNER = "bulk-role-owner@test.local"
LEADER = "bulk-role-leader@test.local"
INNOCENT = "bulk-role-admin@test.local"


class TestBulkAssignProjectRolesAuthority(NoLeakMixin, unittest.TestCase):
	"""bulk_assign_project_roles checked `frappe.has_permission("Project",
	"write", name)` per project. That verb does not mean administrative
	authority here: Project's DocPerm row for "Project Leader" is write=1 with
	NO if_owner, so holding that global role is write-on-every-project at the
	role level, and Project.has_permission then returns True for anyone in
	doc.team_members. A controller hook can only DENY, never grant, so the
	DocPerm table is the floor — which is why reading the hook alone made this
	look safe.

	Two bypasses followed, both proved live and both covered here:
	  * a plain team member holding Project Owner + Project Leader made
	    themselves sole Project Admin of a project they neither owned nor led,
	    evicting the real admin
	  * the project's own LEADER reassigned the leadership, which
	    Project.validate_edit_permission reserves to the owner

	Neither was caught by that controller rule because this endpoint saves with
	ignore_permissions=True and validate_edit_permission's first line returns
	early on exactly that flag. The gate now restates its rule.

	The two regression tests are load-bearing: the obvious fix — dropping
	ignore_permissions so validate_edit_permission runs — is an outage, because
	Project Owner's DocPerm row is if_owner=1 and an owner who did not
	personally create the row would lose role-level write.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		for email, roles in (
			(ATTACKER, ["Project Owner", "Project Leader"]),
			(OWNER, ["Project Owner", "Project Leader"]),
			(LEADER, ["Project Owner", "Project Leader"]),
			(INNOCENT, []),
		):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
			if roles:
				frappe.get_doc("User", email).add_roles(*roles)
		self.project = self._project()

	def tearDown(self):
		frappe.set_user("Administrator")

	def _project(self):
		brand = frappe.get_all("Brand", pluck="name", limit=1)
		if not brand:
			self.skipTest("site has no Brand to attach a probe project to")
		return frappe.get_doc({
			"doctype": "Project", "project_name": "Bulk Role Authority Probe",
			"project_owner": OWNER, "project_leader": LEADER, "status": "Ongoing",
			"brand": brand[0],
			"start_date": frappe.utils.nowdate(),
			"deadline": frappe.utils.add_days(frappe.utils.nowdate(), 30),
			# ATTACKER is ONLY a team member — not owner, leader or admin
			"team_members": [{"user": ATTACKER}],
			"project_admins": [{"user": INNOCENT}],
		}).insert(ignore_permissions=True).name

	def _admins(self):
		return [a.user for a in frappe.get_doc("Project", self.project).project_admins]

	def _call(self, as_user, **kw):
		frappe.set_user(as_user)
		try:
			return bulk_assign_project_roles(projects=[self.project], **kw)
		finally:
			frappe.set_user("Administrator")

	def test_a_team_member_cannot_take_over_the_admin_list(self):
		res = self._call(ATTACKER, admins=[ATTACKER], admin_mode="replace")
		self.assertEqual(res["updated"], [])
		self.assertEqual([s["name"] for s in res["skipped"]], [self.project])
		self.assertEqual(
			self._admins(), [INNOCENT],
			"the legitimate admin must not be evicted",
		)

	def test_the_leader_cannot_reassign_the_leadership(self):
		res = self._call(LEADER, set_leader=1, leader=ATTACKER)
		self.assertEqual(res["updated"], [])
		self.assertEqual(
			frappe.db.get_value("Project", self.project, "project_leader"), LEADER,
			"validate_edit_permission reserves owner/leader changes to the owner",
		)

	# --- REGRESSION: the tool must keep working for the people it is for ---------

	def test_the_project_owner_can_still_bulk_assign(self):
		res = self._call(OWNER, admins=[ATTACKER], admin_mode="replace")
		self.assertEqual(res["updated"], [self.project])
		self.assertEqual(self._admins(), [ATTACKER])

	def test_a_system_manager_can_still_bulk_assign(self):
		res = self._call("Administrator", admins=[ATTACKER], admin_mode="replace")
		self.assertEqual(res["updated"], [self.project])
		self.assertEqual(self._admins(), [ATTACKER])

	def test_the_owner_can_still_change_the_leader(self):
		res = self._call(OWNER, set_leader=1, leader=ATTACKER)
		self.assertEqual(res["updated"], [self.project])
		self.assertEqual(
			frappe.db.get_value("Project", self.project, "project_leader"), ATTACKER
		)
