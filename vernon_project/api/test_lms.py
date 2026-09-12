# Copyright (c) 2026, Vernon and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_project.api.lms import complete_lesson


class TestCompleteLessonRace(FrappeTestCase):
	"""6gb7lcr41q-adjacent concurrency probe (2026-09-10): complete_lesson had
	no lock around its check-then-write critical section (_mint_points checks
	Point Ledger existence, then inserts). Live-proved with two genuinely
	independent DB connections racing the SAME course's last lesson: 1 of 8
	trials silently minted points TWICE for one completion; the other 7 either
	deadlocked or hit a TimestampMismatchError on enr.save() -- unreliable
	even short of the double-mint. Fixed with the same get_lock/release_lock
	pattern mobile.py already uses for spend/gami paths (vernon_lms:{user}).
	complete_lesson had ZERO test coverage before this file (grepped)."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", "lms_race_user@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "lms_race_user@example.com", "first_name": "LmsRace",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		# "published": 1 and "sort_order": 1 were the fields this fixture used until
		# 2026-09-12; neither exists (Course has `status`, Course Lesson has
		# `position`), so frappe dropped them and the course was left at status's
		# "Draft" default. It went unnoticed because complete_lesson did not check
		# the course was Published — the check that now exists is what surfaced it.
		self.course = frappe.get_doc({
			"doctype": "Course", "title": "Lock Test Course", "points_reward": 50,
			"status": "Published",
		}).insert(ignore_permissions=True)
		self.lesson = frappe.get_doc({
			"doctype": "Course Lesson", "course": self.course.name, "title": "Only Lesson",
			"position": 1,
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")
		for n in frappe.get_all("Point Ledger", filters={"course": self.course.name}, pluck="name"):
			frappe.delete_doc("Point Ledger", n, force=True, ignore_permissions=True)
		enr = frappe.db.exists("Course Enrollment", {"course": self.course.name, "user": "lms_race_user@example.com"})
		if enr:
			frappe.delete_doc("Course Enrollment", enr, force=True, ignore_permissions=True)
		frappe.delete_doc("Course Lesson", self.lesson.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Course", self.course.name, force=True, ignore_permissions=True)

	def test_completing_the_only_lesson_awards_points_once(self):
		frappe.set_user("lms_race_user@example.com")
		res = complete_lesson(course=self.course.name, lesson=self.lesson.name)
		frappe.set_user("Administrator")
		self.assertEqual(res["points_awarded"], 50.0)
		self.assertTrue(res["completed"])
		rows = frappe.get_all("Point Ledger", filters={"course": self.course.name, "user": "lms_race_user@example.com"})
		self.assertEqual(len(rows), 1)

	def test_calling_again_after_completion_does_not_remint(self):
		frappe.set_user("lms_race_user@example.com")
		complete_lesson(course=self.course.name, lesson=self.lesson.name)
		res2 = complete_lesson(course=self.course.name, lesson=self.lesson.name)
		frappe.set_user("Administrator")
		self.assertEqual(res2["points_awarded"], 0.0)
		rows = frappe.get_all("Point Ledger", filters={"course": self.course.name, "user": "lms_race_user@example.com"})
		self.assertEqual(len(rows), 1)

	def test_refuses_cleanly_when_the_lock_is_already_held(self):
		"""Simulates a concurrent caller already holding the per-user lock --
		get_lock() returns 0, exactly what MySQL returns to the LOSING side of
		a real race. Must refuse before touching any data, not partially write."""
		orig_sql = frappe.db.sql

		def _fake_sql(query, *args, **kwargs):
			if "get_lock" in query:
				return [[0]]
			return orig_sql(query, *args, **kwargs)

		frappe.set_user("lms_race_user@example.com")
		frappe.db.sql = _fake_sql
		try:
			with self.assertRaises(frappe.ValidationError):
				complete_lesson(course=self.course.name, lesson=self.lesson.name)
		finally:
			frappe.db.sql = orig_sql
			frappe.set_user("Administrator")
		self.assertFalse(frappe.db.exists("Course Enrollment", {"course": self.course.name, "user": "lms_race_user@example.com"}))
		rows = frappe.get_all("Point Ledger", filters={"course": self.course.name, "user": "lms_race_user@example.com"})
		self.assertEqual(len(rows), 0)
