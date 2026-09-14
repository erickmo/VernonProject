# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
import frappe.realtime

from vernon_project.api.feedback import submit_feedback
from vernon_project.tests.no_leak import NoLeakMixin

SUBMITTER = "feedback-rt-anon@test.local"


class TestAnonymousFeedbackIsUnattributableOverRealtime(NoLeakMixin, unittest.TestCase):
	"""The stored row and the notifications were scrubbed (test_feedback_anonymity),
	but every insert also queues a `list_update` realtime event whose payload is
	{doctype, name, user: frappe.session.user}, published to the DOCTYPE room — which
	any user holding read on that doctype may subscribe to. So submitting anonymously
	announced the submitter live: once for the Company Feedback row (System Managers,
	exactly the audience anonymous feedback is protected from) and once per admin
	notification, each naming a row that points back to the feedback.

	The last test is what stops the fix going too far: the ATTRIBUTED path must keep
	publishing normally, or Desk lists stop refreshing for everyone.
	"""

	maxDiff = None

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", SUBMITTER):
			frappe.get_doc({
				"doctype": "User", "email": SUBMITTER, "first_name": "feedback-rt-anon",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _submit_capturing_realtime(self, anon, message):
		"""Capture at the emit boundary: flush_realtime_log() looks
		frappe.realtime.emit_via_redis up at call time, so this sees exactly what
		would reach the socket, for every doctype the request touches.

		The flush is called here by hand because NoLeakMixin holds db.commit, and
		these events are queued with after_commit=True — in production the commit
		flushes them."""
		events, original = [], frappe.realtime.emit_via_redis

		def capture(event, payload, room):
			events.append((event, payload, room))

		# Drop whatever setUp queued — creating the fixture User also creates its
		# Notification Settings, and NoLeakMixin's rollback means that happens again
		# every test. Only this request's own events should be captured.
		frappe.realtime.clear_realtime_log()
		frappe.realtime.emit_via_redis = capture
		frappe.set_user(SUBMITTER)
		try:
			submit_feedback("Criticism", message, is_anonymous=1 if anon else 0)
			frappe.realtime.flush_realtime_log()
		finally:
			frappe.realtime.emit_via_redis = original
			frappe.set_user("Administrator")
		return events

	def test_no_realtime_event_names_the_anonymous_submitter(self):
		events = self._submit_capturing_realtime(True, "realtime anonymity probe")
		named = [e for e in events if SUBMITTER in frappe.as_json(e)]
		self.assertEqual(named, [], "a realtime event carried the anonymous submitter")

	def test_the_feedback_row_is_still_created(self):
		message = "realtime anonymity probe: still stored"
		self._submit_capturing_realtime(True, message)
		row = frappe.get_all(
			"Company Feedback", filters={"message": message}, fields=["name", "is_anonymous"]
		)
		self.assertEqual(len(row), 1)
		self.assertTrue(row[0]["is_anonymous"])
		self.assertTrue(
			frappe.db.exists(
				"Vernon Notification",
				{"reference_doctype": "Company Feedback", "reference_name": row[0]["name"]},
			),
			"the admins must still be notified",
		)

	def test_an_attributed_submission_still_publishes_normally(self):
		events = self._submit_capturing_realtime(False, "realtime anonymity probe: attributed")
		feedback_updates = [
			e for e in events
			if e[0] == "list_update" and (e[1] or {}).get("doctype") == "Company Feedback"
		]
		self.assertTrue(feedback_updates, "attributed feedback must still publish list_update")
		self.assertEqual(feedback_updates[0][1]["user"], SUBMITTER)
