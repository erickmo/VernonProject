# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# The project_owner or project_leader of any active (Ongoing) project a user is a
# team member of (plus admins) may write notes about that user. Each note is
# optionally tagged with the project it was written under. These tests build real
# Project + Project Team rows and assert the gates + project scoping.

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.api.leader_notes import (
	_can_note,
	add_user_note,
	list_user_notes,
	delete_user_note,
)

SUBJECT = "ln_subject@example.com"
LEADER1 = "ln_leader1@example.com"       # leads an active project SUBJECT is in
LEADER2 = "ln_leader2@example.com"       # leads another active project SUBJECT is in
OWNER = "ln_owner@example.com"           # OWNS (not leads) an active project SUBJECT is in
CLOSED_LEADER = "ln_closedlead@example.com"  # leads only a Closed project
STRANGER = "ln_stranger@example.com"     # in no shared project
USERS = (
	(SUBJECT, "Subject"),
	(LEADER1, "Leader One"),
	(LEADER2, "Leader Two"),
	(OWNER, "Owner Person"),
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
		# LEADER1 leads, Administrator owns.
		self.p_active1 = self._project(LEADER1, "Ongoing", [SUBJECT])
		self.p_active2 = self._project(LEADER2, "Ongoing", [SUBJECT])
		# OWNER owns but LEADER1 leads → exercises the owner branch of _can_note.
		self.p_owned = self._project(LEADER1, "Ongoing", [SUBJECT], owner=OWNER)
		self.p_closed = self._project(CLOSED_LEADER, "Closed", [SUBJECT])
		frappe.db.commit()

	def _project(self, leader, status, members, owner="Administrator"):
		p = frappe.get_doc({
			"doctype": "Project",
			"project_name": f"LN {leader} {status} {frappe.generate_hash(length=6)}",
			"brand": self.brand,
			"project_owner": owner,
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

	# --- authorization (_can_note) ---

	def test_active_leader_can_note(self):
		self.assertTrue(_can_note(SUBJECT, LEADER1))
		self.assertTrue(_can_note(SUBJECT, LEADER2))

	def test_active_owner_can_note(self):
		# OWNER owns an active project SUBJECT is in but leads none of them.
		self.assertTrue(_can_note(SUBJECT, OWNER))

	def test_closed_project_leader_cannot_note(self):
		self.assertFalse(_can_note(SUBJECT, CLOSED_LEADER))

	def test_stranger_cannot_note(self):
		self.assertFalse(_can_note(SUBJECT, STRANGER))

	def test_not_own_noter(self):
		self.assertFalse(_can_note(SUBJECT, SUBJECT))

	# --- note gates ---

	def test_add_user_note_gate(self):
		frappe.set_user(LEADER1)
		self.assertTrue(add_user_note(SUBJECT, "leader note")["name"])
		frappe.set_user(OWNER)
		self.assertTrue(add_user_note(SUBJECT, "owner note")["name"])
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

	def test_note_project_tag(self):
		frappe.set_user(LEADER1)
		n = add_user_note(SUBJECT, "tagged", project=self.p_active1)
		self.assertEqual(n["project"], self.p_active1)
		self.assertTrue(n["project_title"])  # resolved from project_name
		# empty/absent project ⇒ untagged
		u = add_user_note(SUBJECT, "untagged")
		self.assertIsNone(u["project"])

	def test_add_note_bad_project_rejected(self):
		frappe.set_user(LEADER1)
		with self.assertRaises(frappe.DoesNotExistError):
			add_user_note(SUBJECT, "bad", project="Nonexistent Project XYZ")

	def test_list_scoped_to_project(self):
		frappe.set_user(LEADER1)
		add_user_note(SUBJECT, "on p1", project=self.p_active1)
		add_user_note(SUBJECT, "on p2", project=self.p_active2)
		add_user_note(SUBJECT, "untagged")
		# unscoped ⇒ all three
		self.assertEqual(len(list_user_notes(SUBJECT)["notes"]), 3)
		# scoped ⇒ only that project's note
		scoped = list_user_notes(SUBJECT, project=self.p_active1)["notes"]
		self.assertEqual(len(scoped), 1)
		self.assertEqual(scoped[0]["project"], self.p_active1)

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
