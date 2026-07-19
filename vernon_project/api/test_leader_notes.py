# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# A user's leaders are DERIVED from projects: the project_leader of every active
# (Ongoing) project the user is a team member of. These tests build real
# Project + Project Team rows and assert the derivation + note gates.

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.api.leader_notes import (
	_is_leader_of,
	get_user_leaders,
	list_led_users,
	add_user_note,
	list_user_notes,
	delete_user_note,
)

SUBJECT = "ln_subject@example.com"
LEADER1 = "ln_leader1@example.com"       # leads an active project SUBJECT is in
LEADER2 = "ln_leader2@example.com"       # leads another active project SUBJECT is in
CLOSED_LEADER = "ln_closedlead@example.com"  # leads only a Closed project
STRANGER = "ln_stranger@example.com"     # in no shared project
USERS = (
	(SUBJECT, "Subject"),
	(LEADER1, "Leader One"),
	(LEADER2, "Leader Two"),
	(CLOSED_LEADER, "Closed Leader"),
	(STRANGER, "Stranger"),
)


class TestLeaderNotes(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		leaders = {LEADER1, LEADER2, CLOSED_LEADER}
		for email, name in USERS:
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": name,
					"send_welcome_email": 0, "enabled": 1,
				}).insert(ignore_permissions=True)
			if email in leaders and not frappe.db.exists("Has Role", {"parent": email, "role": "Project Leader"}):
				frappe.get_doc("User", email).add_roles("Project Leader")
		self.brand = frappe.get_all("Brand", pluck="name", limit=1)[0]

		self.projects = []
		self.p_active1 = self._project(LEADER1, "Ongoing", [SUBJECT])
		self.p_active2 = self._project(LEADER2, "Ongoing", [SUBJECT])
		self.p_closed = self._project(CLOSED_LEADER, "Closed", [SUBJECT])
		frappe.db.commit()

	def _project(self, leader, status, members):
		p = frappe.get_doc({
			"doctype": "Project",
			"project_name": f"LN {leader} {status} {frappe.generate_hash(length=6)}",
			"brand": self.brand,
			"project_owner": "Administrator",
			"project_leader": leader,
			"status": status,
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [{"user": m} for m in members],
		}).insert(ignore_permissions=True)
		self.projects.append(p.name)
		return p.name

	def tearDown(self):
		frappe.set_user("Administrator")
		for email, _ in USERS:
			frappe.db.delete("Leader Note", {"user": email})
		for name in self.projects:
			frappe.delete_doc("Project", name, ignore_permissions=True, force=1)
		for email, _ in USERS:
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, ignore_permissions=True, force=1)
		frappe.db.commit()

	# --- derivation ---

	def test_is_leader_of_active_project(self):
		self.assertTrue(_is_leader_of(SUBJECT, LEADER1))
		self.assertTrue(_is_leader_of(SUBJECT, LEADER2))

	def test_closed_project_leader_is_not_a_leader(self):
		self.assertFalse(_is_leader_of(SUBJECT, CLOSED_LEADER))

	def test_stranger_is_not_a_leader(self):
		self.assertFalse(_is_leader_of(SUBJECT, STRANGER))

	def test_not_own_leader(self):
		# SUBJECT leads no project → not their own leader even if somehow a member
		self.assertFalse(_is_leader_of(SUBJECT, SUBJECT))

	def test_get_user_leaders_is_derived(self):
		frappe.set_user(LEADER1)
		leaders = {row["leader"] for row in get_user_leaders(SUBJECT)}
		self.assertEqual(leaders, {LEADER1, LEADER2})
		self.assertNotIn(CLOSED_LEADER, leaders)

	def test_list_led_users_from_active_team(self):
		frappe.set_user(LEADER1)
		led = {row["user"] for row in list_led_users()}
		# SUBJECT is a team member of LEADER1's active project (the app may also
		# auto-add the project owner to the team — we only assert SUBJECT is led).
		self.assertIn(SUBJECT, led)
		self.assertNotIn(LEADER1, led)  # never your own mentee
		# closed-only leader leads nobody
		frappe.set_user(CLOSED_LEADER)
		self.assertEqual(list_led_users(), [])

	# --- note gates ---

	def test_add_user_note_gate(self):
		frappe.set_user(LEADER1)
		self.assertTrue(add_user_note(SUBJECT, "leader note")["name"])
		frappe.set_user("Administrator")
		self.assertTrue(add_user_note(SUBJECT, "admin note")["name"])
		frappe.set_user(STRANGER)
		with self.assertRaises(frappe.PermissionError):
			add_user_note(SUBJECT, "stranger note")
		frappe.set_user(CLOSED_LEADER)
		with self.assertRaises(frappe.PermissionError):
			add_user_note(SUBJECT, "closed-project leader note")

	def test_note_date_global_vs_dated(self):
		frappe.set_user(LEADER1)
		g = add_user_note(SUBJECT, "global", note_date="")
		d = add_user_note(SUBJECT, "dated", note_date="2026-07-18")
		self.assertIsNone(g["note_date"])
		self.assertEqual(d["note_date"], "2026-07-18")

	def test_list_user_notes_visibility(self):
		frappe.set_user(LEADER1)
		add_user_note(SUBJECT, "private", shared_with_user=0)
		add_user_note(SUBJECT, "shared", shared_with_user=1)
		# leader sees all + can_add
		v = list_user_notes(SUBJECT)
		self.assertEqual(len(v["notes"]), 2)
		self.assertTrue(v["can_add"])
		# subject sees shared-only, cannot add
		frappe.set_user(SUBJECT)
		vs = list_user_notes(SUBJECT)
		self.assertEqual(len(vs["notes"]), 1)
		self.assertFalse(vs["can_add"])
		# stranger denied
		frappe.set_user(STRANGER)
		with self.assertRaises(frappe.PermissionError):
			list_user_notes(SUBJECT)

	def test_delete_user_note(self):
		frappe.set_user(LEADER1)
		n = add_user_note(SUBJECT, "to delete")
		# another leader of the same subject (not the author, not admin) cannot delete
		frappe.set_user(LEADER2)
		with self.assertRaises(frappe.PermissionError):
			delete_user_note(n["name"])
		# author can
		frappe.set_user(LEADER1)
		self.assertEqual(delete_user_note(n["name"])["name"], n["name"])
		# admin can delete anyone's
		frappe.set_user(LEADER1)
		n2 = add_user_note(SUBJECT, "admin will delete")
		frappe.set_user("Administrator")
		self.assertEqual(delete_user_note(n2["name"])["name"], n2["name"])
