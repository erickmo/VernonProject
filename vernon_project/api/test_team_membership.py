# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# clone_memberships adds new employee A to every project template employee B is
# on — as a plain team member, additively, idempotently, SysMgr-only. B appears
# in Project Team even for projects B merely leads (owner/leader auto-append), so
# A must join those too. These tests build real Project + Project Team rows.

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.api.team_membership import clone_memberships, _b_project_names
from vernon_project.api.mobile import _project_team

TEMPLATE = "cm_template@example.com"  # B — the colleague to mirror
NEWBIE = "cm_newbie@example.com"      # A — new employee, enabled
DISABLED = "cm_disabled@example.com"  # A candidate that is disabled → rejected
STRANGER = "cm_stranger@example.com"  # not a SysMgr → gate rejects
USERS = ((TEMPLATE, "Template B"), (NEWBIE, "Newbie A"), (DISABLED, "Disabled A"), (STRANGER, "Stranger"))


class TestCloneMemberships(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		for email, name in USERS:
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": name,
					"send_welcome_email": 0, "enabled": 0 if email == DISABLED else 1,
				}).insert(ignore_permissions=True)
		frappe.get_doc("User", TEMPLATE).add_roles("Project Leader")
		self.brand = frappe.get_all("Brand", pluck="name", limit=1)[0]

		self.projects = []
		# B is a plain team member of two projects Administrator owns+leads.
		self.p_member1 = self._project("Administrator", [TEMPLATE])
		self.p_member2 = self._project("Administrator", [TEMPLATE])
		# B LEADS this one (owner/leader auto-appended to team) — A must still join.
		self.p_led = self._project(TEMPLATE, [])
		# B is not on this one — A must NOT be added here.
		self.p_other = self._project("Administrator", [])
		frappe.db.commit()

	def _project(self, leader, members):
		p = frappe.get_doc({
			"doctype": "Project",
			"project_name": f"CM {frappe.generate_hash(length=6)}",
			"brand": self.brand,
			"project_owner": "Administrator",
			"project_leader": leader,
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [{"user": m} for m in members],
		}).insert(ignore_permissions=True)
		self.projects.append(p.name)
		return p.name

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in self.projects:
			frappe.delete_doc("Project", name, ignore_permissions=True, force=1)
		for email, _ in USERS:
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, ignore_permissions=True, force=1)
		frappe.db.commit()

	def test_b_is_on_member_and_led_projects(self):
		names = _b_project_names(TEMPLATE)
		self.assertIn(self.p_member1, names)
		self.assertIn(self.p_member2, names)
		self.assertIn(self.p_led, names)  # via owner/leader auto-append
		self.assertNotIn(self.p_other, names)

	def test_clone_adds_a_to_bs_projects_only(self):
		res = clone_memberships(TEMPLATE, NEWBIE)
		self.assertEqual(len(res["added"]), 3)
		for p in (self.p_member1, self.p_member2, self.p_led):
			self.assertIn(NEWBIE, _project_team(p))
		self.assertNotIn(NEWBIE, _project_team(self.p_other))

	def test_clone_never_touches_template(self):
		clone_memberships(TEMPLATE, NEWBIE)
		# B stays exactly where B was.
		self.assertIn(TEMPLATE, _project_team(self.p_member1))
		self.assertNotIn(TEMPLATE, _project_team(self.p_other))

	def test_idempotent(self):
		clone_memberships(TEMPLATE, NEWBIE)
		res2 = clone_memberships(TEMPLATE, NEWBIE)
		self.assertEqual(res2["added"], [])
		self.assertEqual(res2["skipped_existing"], 3)

	def test_dry_run_writes_nothing(self):
		res = clone_memberships(TEMPLATE, NEWBIE, dry_run=1)
		self.assertEqual(len(res["to_add"]), 3)
		self.assertEqual(res["skipped_existing"], 0)
		self.assertNotIn(NEWBIE, _project_team(self.p_member1))  # nothing written

	def test_reject_disabled_target(self):
		with self.assertRaises(frappe.ValidationError):
			clone_memberships(TEMPLATE, DISABLED)

	def test_reject_same_user(self):
		with self.assertRaises(frappe.ValidationError):
			clone_memberships(TEMPLATE, TEMPLATE)

	def test_reject_unknown_user(self):
		with self.assertRaises(frappe.ValidationError):
			clone_memberships(TEMPLATE, "nobody@example.com")

	def test_reject_non_system_manager(self):
		frappe.set_user(STRANGER)
		try:
			with self.assertRaises(frappe.PermissionError):
				clone_memberships(TEMPLATE, NEWBIE)
		finally:
			frappe.set_user("Administrator")
