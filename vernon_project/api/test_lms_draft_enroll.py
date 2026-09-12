# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api.lms import complete_lesson
from vernon_project.tests.no_leak import NoLeakMixin

LEARNER = "lms-draft-probe@test.local"


class TestCompleteLessonNeedsAPublishedCourse(NoLeakMixin, unittest.TestCase):
	"""enroll() refuses a course that is not Published; complete_lesson used to
	create the enrollment itself with no such check, so the implicit path skipped
	the gate the explicit one enforced and _recompute minted the course's
	points_reward on the last lesson.

	Nothing had to be guessed to reach it: course.json and course_lesson.json both
	carry {"role": "All", "read": 1} with no permission_query_conditions and no
	has_permission hook, so /api/resource lists a Draft course, its points_reward
	and its lesson names to any logged-in user.

	The two regression tests matter more than the first one here, because the
	obvious fix — gating completion on course status — is an outage: it strands
	everyone already enrolled the moment a course is unpublished, and assign_course
	is deliberately status-agnostic. Only the implicit self-enrollment is gated.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", LEARNER):
			frappe.get_doc({
				"doctype": "User", "email": LEARNER, "first_name": "lms-draft-probe",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _course(self, status):
		"""A course with exactly one lesson — _recompute only mints when every
		lesson is done, so one lesson is a complete course."""
		course = frappe.get_doc({
			"doctype": "Course", "title": f"probe {status}", "status": status,
			"points_reward": 50,
		}).insert(ignore_permissions=True).name
		lesson = frappe.get_doc({
			"doctype": "Course Lesson", "course": course, "title": "only lesson",
			"position": 1,
		}).insert(ignore_permissions=True).name
		return course, lesson

	def _learning_rows(self):
		return frappe.db.count("Point Ledger", {"user": LEARNER, "source": "Learning"})

	def test_a_draft_course_cannot_be_self_enrolled_and_mints_nothing(self):
		course, lesson = self._course("Draft")
		before = self._learning_rows()
		frappe.set_user(LEARNER)
		with self.assertRaises(frappe.ValidationError):
			complete_lesson(course, lesson)
		frappe.set_user("Administrator")
		self.assertEqual(
			self._learning_rows(), before,
			"an unpublished course must not pay out its reward",
		)

	# --- REGRESSION: the two legitimate paths must keep working -----------------

	def test_a_published_course_still_completes_and_pays(self):
		course, lesson = self._course("Published")
		frappe.set_user(LEARNER)
		res = complete_lesson(course, lesson)
		frappe.set_user("Administrator")
		self.assertTrue(res["completed"])
		self.assertEqual(res["points_awarded"], 50.0)

	def test_an_assigned_enrollment_survives_the_course_being_unpublished(self):
		course, lesson = self._course("Draft")
		frappe.get_doc({
			"doctype": "Course Enrollment", "course": course, "user": LEARNER,
			"assigned": 1, "assigned_by": "Administrator", "status": "Assigned",
		}).insert(ignore_permissions=True)
		frappe.set_user(LEARNER)
		res = complete_lesson(course, lesson)
		frappe.set_user("Administrator")
		self.assertTrue(
			res["completed"],
			"gating completion itself would strand everyone already enrolled",
		)
