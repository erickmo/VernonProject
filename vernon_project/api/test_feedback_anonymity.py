# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api.feedback import submit_feedback
from vernon_project.tests.no_leak import NoLeakMixin

SUBMITTER = "feedback-anon-test@test.local"


class TestAnonymousFeedbackIsUnattributable(NoLeakMixin, unittest.TestCase):
	"""submit_feedback scrubbed `owner` and stopped there, with a comment saying
	anonymous feedback was "unattributable even to admins". Frappe stamps
	modified_by with the session user on insert exactly like owner, and
	update_modified=False keeps it rather than clearing it — so every anonymous
	row still named its author, as did the admin notifications, which are inserted
	inside the submitter's own request and point back by reference_name.

	Both audiences for that data are System-Manager-only, which is not mitigation:
	management is who anonymous feedback exists to be protected from.

	The last test is the one that stops the fix from going too far — the ATTRIBUTED
	path must keep recording who submitted, or "anonymous" stops meaning anything.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", SUBMITTER):
			frappe.get_doc({
				"doctype": "User", "email": SUBMITTER, "first_name": "feedback-anon-test",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _submit(self, anon, message):
		frappe.set_user(SUBMITTER)
		submit_feedback("Criticism", message, is_anonymous=1 if anon else 0)
		frappe.set_user("Administrator")
		return frappe.get_all("Company Feedback", filters={"message": message}, pluck="name")[0]

	def _audit(self, doctype, name):
		return frappe.db.get_value(doctype, name, ["owner", "modified_by"], as_dict=True)

	def _notification_stamps(self, feedback):
		return frappe.db.sql(
			"select distinct owner, modified_by from `tabVernon Notification` "
			"where reference_doctype='Company Feedback' and reference_name=%s",
			feedback,
		)

	def test_the_feedback_row_names_nobody(self):
		name = self._submit(True, "anonymity probe: row")
		audit = self._audit("Company Feedback", name)
		self.assertNotEqual(audit["owner"], SUBMITTER)
		self.assertNotEqual(
			audit["modified_by"], SUBMITTER,
			"owner was scrubbed and modified_by was not — the same stamp, missed",
		)
		self.assertIsNone(frappe.db.get_value("Company Feedback", name, "submitted_by"))

	def test_the_admin_notifications_name_nobody_either(self):
		name = self._submit(True, "anonymity probe: notifications")
		stamps = self._notification_stamps(name)
		self.assertTrue(stamps, "the admins must still be notified")
		for owner, modified_by in stamps:
			self.assertNotEqual(owner, SUBMITTER)
			self.assertNotEqual(modified_by, SUBMITTER)

	# --- the other direction: do not over-scrub ---------------------------------

	def test_attributed_feedback_still_records_its_author(self):
		name = self._submit(False, "anonymity probe: attributed")
		self.assertEqual(frappe.db.get_value("Company Feedback", name, "submitted_by"), SUBMITTER)
		self.assertEqual(self._audit("Company Feedback", name)["owner"], SUBMITTER)
