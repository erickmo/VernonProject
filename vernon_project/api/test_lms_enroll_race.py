# Copyright (c) 2026, Vernon and contributors
# See license.txt

import threading
import unittest

import frappe

from vernon_project.api.lms import _enrollment, complete_lesson, enroll

USER = "lms-race@test.local"


class TestLmsEnrollRace(unittest.TestCase):
	"""complete_lesson released its get_lock before the request committed, and this
	bench runs REPEATABLE READ. A second call whose snapshot predated the first one's
	commit still read "not enrolled", so it inserted a SECOND Course Enrollment for
	the same (course, user) — nothing in the schema forbids it. enroll() took no lock
	at all, so it raced the same way against itself.

	Not on NoLeakMixin: the race needs a second connection that really commits, so
	tearDown deletes this user's rows by name (same as test_task_crate_race)."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", USER):
			frappe.get_doc({"doctype": "User", "email": USER, "first_name": "lms-race",
				"send_welcome_email": 0}).insert(ignore_permissions=True)
		self.course = frappe.get_doc({"doctype": "Course", "title": "LMS Race Course",
			"status": "Published", "points_reward": 5}).insert(ignore_permissions=True).name
		self.lesson = frappe.get_doc({"doctype": "Course Lesson", "course": self.course,
			"title": "Only lesson", "position": 1}).insert(ignore_permissions=True).name
		self._cleanup()
		frappe.db.commit()

	def tearDown(self):
		frappe.db.rollback()  # drop any pinned snapshot before cleaning up
		frappe.set_user("Administrator")
		self._cleanup()
		frappe.delete_doc("Course Lesson", self.lesson, force=True, ignore_permissions=True)
		frappe.delete_doc("Course", self.course, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _cleanup(self):
		frappe.db.delete("Point Ledger", {"user": USER})
		# delete_doc, not db.delete: the enrollment's lessons_done child rows would
		# otherwise be left behind as orphans in Course Lesson Progress.
		for name in frappe.get_all("Course Enrollment", filters={"user": USER}, pluck="name"):
			frappe.delete_doc("Course Enrollment", name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _in_another_session(self, fn):
		site, errors = frappe.local.site, []

		def run():
			frappe.init(site=site)
			frappe.connect()
			try:
				frappe.set_user(USER)
				fn()
				frappe.db.commit()
			except Exception as e:  # noqa: BLE001 - reported below
				errors.append(e)
			finally:
				frappe.destroy()

		t = threading.Thread(target=run)
		t.start()
		t.join(30)
		self.assertEqual(errors, [], "the other session's call must succeed")

	def _enrollments(self):
		return frappe.db.count("Course Enrollment", {"course": self.course, "user": USER})

	def test_complete_lesson_from_an_old_snapshot_does_not_enroll_twice(self):
		frappe.set_user(USER)
		self.assertIsNone(_enrollment(self.course, USER))  # pins this transaction's snapshot
		self._in_another_session(lambda: complete_lesson(self.course, self.lesson))
		complete_lesson(self.course, self.lesson)
		frappe.db.commit()
		frappe.set_user("Administrator")
		self.assertEqual(self._enrollments(), 1, "one learner, one enrollment")
		self.assertEqual(
			frappe.db.count("Point Ledger", {"course": self.course, "user": USER}), 1,
			"the course must pay out once",
		)

	def test_enroll_from_an_old_snapshot_does_not_enroll_twice(self):
		frappe.set_user(USER)
		self.assertIsNone(_enrollment(self.course, USER))  # pins this transaction's snapshot
		self._in_another_session(lambda: enroll(self.course))
		enroll(self.course)
		frappe.db.commit()
		frappe.set_user("Administrator")
		self.assertEqual(self._enrollments(), 1, "one learner, one enrollment")
