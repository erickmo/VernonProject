# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, now, nowdate

from vernon_project.api.project_todo import reject_status, undo_approval
from vernon_project.tests.no_leak import NoLeakMixin
from vernon_project.vernon_project.doctype.project_todo.project_todo import build_occurrence
from vernon_project.vernon_project.doctype.project_todo.test_project_todo import _ensure_test_group

LEADER = "undo-followup-leader@test.local"
WORKER = "undo-followup-worker@test.local"


class TestUndoRecurringFollowupCleanup(NoLeakMixin, unittest.TestCase):
	"""Undoing a Completion deletes the successor that Completion generated, but only
	while it is untouched. The test for "untouched" was `developed_at is not set`,
	which reject_status clears — so an occurrence the assignee had worked on, been
	bounced back on, and was revising looked freshly generated and was deleted, its
	notes and attachments with it."""

	def setUp(self):
		frappe.set_user("Administrator")
		brand = frappe.get_all("Brand", pluck="name", limit=1)
		if not brand:
			self.skipTest("site has no Brand")
		self.group, self.level_id = _ensure_test_group()
		for email in (LEADER, WORKER):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.get_doc("User", LEADER).add_roles("Project Owner", "Project Leader")
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Undo Followup Probe", "brand": brand[0],
			"project_owner": LEADER, "project_leader": LEADER, "status": "Ongoing",
			"start_date": add_days(nowdate(), -2), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": WORKER}, {"user": LEADER}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "Undo Followup Grouping",
			"project": self.project.name}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Undo Followup Detail",
			"grouping": grouping.name, "project_deadline": add_days(nowdate(), 30), "estimated": 100,
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _anchor(self):
		"""A daily series whose current occurrence the owner has just Completed."""
		doc = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name, "to_do": "Undo followup probe",
			"assigned_to": WORKER, "start_date": add_days(nowdate(), -1), "deadline": add_days(nowdate(), -1),
			"estimated": 30, "status": "⚪️ Planned", "group": self.group, "level_id": self.level_id,
			"is_recurring": 1, "recurring_frequency": "Daily",
		}).insert(ignore_permissions=True)
		frappe.db.set_value("Project Todo", doc.name, {
			"status": "✅ Completed", "completed_by": LEADER, "completed_at": now(),
		}, update_modified=False)
		return frappe.get_doc("Project Todo", doc.name)

	def _successor(self, anchor):
		return build_occurrence(anchor, nowdate())

	def _undo(self, anchor):
		frappe.set_user(LEADER)
		try:
			return undo_approval(anchor.name)
		finally:
			frappe.set_user("Administrator")

	def test_an_occurrence_sent_back_for_revision_is_not_deleted(self):
		anchor = self._anchor()
		nxt = self._successor(anchor)
		frappe.db.set_value("Project Todo", nxt.name, "status", "🟠 Done")
		frappe.set_user(LEADER)
		rejected = reject_status(nxt.name, reason="Kurang lengkap")
		frappe.set_user("Administrator")
		self.assertEqual(rejected["status"], "info", rejected["message"])
		self.assertIsNone(frappe.db.get_value("Project Todo", nxt.name, "developed_at"),
			"reject clears developed_at — the old untouched-test relied on it")

		res = self._undo(anchor)
		self.assertEqual(res["status"], "info", res["message"])
		self.assertTrue(frappe.db.exists("Project Todo", nxt.name),
			"work someone is revising must survive an undo of the previous completion")

	def test_an_edited_occurrence_is_not_deleted(self):
		anchor = self._anchor()
		nxt = self._successor(anchor)
		nxt.notes = "<p>sudah mulai</p>"
		nxt.save(ignore_permissions=True)

		self._undo(anchor)
		self.assertTrue(frappe.db.exists("Project Todo", nxt.name))

	def test_an_untouched_occurrence_is_still_cleaned_up(self):
		anchor = self._anchor()
		nxt = self._successor(anchor)

		res = self._undo(anchor)
		self.assertEqual(res["status"], "info", res["message"])
		self.assertFalse(frappe.db.exists("Project Todo", nxt.name),
			"the whole point of the cleanup: an untouched generated occurrence goes")
