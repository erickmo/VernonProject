# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""add_user_note must not become a directory of every project on the site.

The shaped note it returns carries `project_title`, resolved through
_project_meta_map -> frappe.get_all, which does NOT check permissions. `project`
was only checked for EXISTENCE, and Project is named by naming_series, so the
names are guessable. Any author who could note one user could therefore tag a
note with any project id, read that project's title out of the response, and
delete the note again.

Isolated with NoLeakMixin: this builds users and projects, and without it they
would be committed to the live site.
"""

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.leader_notes import add_user_note
from vernon_project.tests.no_leak import NoLeakMixin

LEADER = "zz-note-leader@example.com"
SUBJECT = "zz-note-subject@example.com"
SECRET_TITLE = "ZZ Confidential Acquisition Project"


class TestLeaderNoteProjectScope(NoLeakMixin, unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.brand = self._brand()
		self.leader = self._user(LEADER, ("Project Leader", "Project Owner"))
		self.subject = self._user(SUBJECT, ())

		# The project the leader really leads, with the subject on its team --
		# this is what makes _can_note(subject, leader) true.
		self.own = self._project("ZZ Note Own Project", leader=LEADER, members=[SUBJECT])
		# A project the leader has nothing to do with. Its TITLE is the secret.
		self.secret = self._project(SECRET_TITLE, leader="Administrator", members=[])

	def _brand(self):
		if not frappe.db.exists("Brand", "ZZ Note Brand"):
			frappe.get_doc({
				"doctype": "Brand", "brand_name": "ZZ Note Brand",
				"company": frappe.db.get_value("Company", {}, "name"),
			}).insert(ignore_permissions=True)
		return "ZZ Note Brand"

	def _user(self, email, roles):
		if not frappe.db.exists("User", email):
			frappe.get_doc({
				"doctype": "User", "email": email, "first_name": email.split("@")[0],
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		if roles:
			frappe.get_doc("User", email).add_roles(*roles)
		return email

	def _project(self, title, leader, members):
		return frappe.get_doc({
			"doctype": "Project", "project_name": title, "brand": self.brand,
			"project_owner": leader, "project_leader": leader,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": u} for u in members],
		}).insert(ignore_permissions=True).name

	# ---------------------------------------------------------------- the point

	def test_an_author_cannot_read_the_title_of_a_project_they_cannot_see(self):
		frappe.set_user(LEADER)
		with self.assertRaises(frappe.DoesNotExistError) as caught:
			add_user_note(user=SUBJECT, body="ZZ probe for an unrelated project", project=self.secret)
		# The refusal itself must not carry the secret, and must be the same
		# message a genuinely missing project gets -- otherwise removing the title
		# would still leave a working existence oracle.
		self.assertNotIn(SECRET_TITLE, str(caught.exception))

	def test_the_same_refusal_for_a_project_that_does_not_exist(self):
		"""Existence must not be distinguishable from no-access."""
		frappe.set_user(LEADER)
		with self.assertRaises(frappe.DoesNotExistError) as missing:
			add_user_note(user=SUBJECT, body="ZZ probe missing", project="PROJ-does-not-exist")
		with self.assertRaises(frappe.DoesNotExistError) as forbidden:
			add_user_note(user=SUBJECT, body="ZZ probe forbidden", project=self.secret)
		self.assertEqual(str(missing.exception), str(forbidden.exception))

	# ------------------------------------------------------- positive controls

	def test_the_author_can_still_tag_the_project_they_lead(self):
		"""Or the guard has simply broken the feature."""
		frappe.set_user(LEADER)
		note = add_user_note(user=SUBJECT, body="ZZ probe on my own project", project=self.own)
		self.assertEqual(note["project"], self.own)
		self.assertEqual(note["project_title"], "ZZ Note Own Project")

	def test_an_untagged_note_still_works(self):
		frappe.set_user(LEADER)
		note = add_user_note(user=SUBJECT, body="ZZ probe with no project")
		self.assertIsNone(note["project"])
