# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""List endpoints that resolved one related row at a time.

Each test asserts the same property: the query count must not track how many rows
come back. They create enough rows to make the shape unmistakable even where the
live site currently holds one or two.
"""

import unittest

import frappe
from frappe.utils import add_days, now_datetime, nowdate

from vernon_project.api.events import my_registrations
from vernon_project.api.events_admin import event_roster
from vernon_project.api.lms import course_report, manage_courses, my_learning
from vernon_project.tests.no_leak import NoLeakMixin

LEARNER = "n1-batch-learner@test.local"


class _Fixture(NoLeakMixin, unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", LEARNER):
			frappe.get_doc({"doctype": "User", "email": LEARNER, "first_name": "Learner",
			                "send_welcome_email": 0}).insert(ignore_permissions=True)
		self.events, self.courses = [], []

	def tearDown(self):
		frappe.set_user("Administrator")
		for dt, names in (("Vernon Event", self.events), ("Course", self.courses)):
			for n in names:
				if frappe.db.exists(dt, n):
					frappe.delete_doc(dt, n, ignore_permissions=True, force=True)
		frappe.db.commit()

	@staticmethod
	def _capture(fn):
		seen = []
		original = frappe.db.sql

		def capturing(query, *args, **kwargs):
			seen.append(str(query))
			return original(query, *args, **kwargs)

		frappe.db.sql = capturing
		try:
			result = fn()
		finally:
			frappe.db.sql = original
		return seen, result

	def _event(self, title):
		doc = frappe.get_doc({
			"doctype": "Vernon Event", "title": title, "start_datetime": now_datetime(),
			"organizer": "Administrator",
		}).insert(ignore_permissions=True)
		self.events.append(doc.name)
		return doc

	def _register(self, event, user):
		return frappe.get_doc({
			"doctype": "Vernon Event Registration", "event": event, "user": user,
			"status": "Confirmed", "registered_on": now_datetime(),
		}).insert(ignore_permissions=True)

	def _course(self, title, lessons=1):
		doc = frappe.get_doc({"doctype": "Course", "title": title, "status": "Published"}).insert(
			ignore_permissions=True)
		self.courses.append(doc.name)
		for i in range(lessons):
			frappe.get_doc({"doctype": "Course Lesson", "course": doc.name,
			                "title": f"{title} lesson {i}"}).insert(ignore_permissions=True)
		return doc

	def _enrol(self, course, user, status="In Progress"):
		return frappe.get_doc({
			"doctype": "Course Enrollment", "course": course, "user": user, "status": status,
			"assigned": 1, "due_date": add_days(nowdate(), 3),
		}).insert(ignore_permissions=True)

	def _warm(self, *doctypes):
		"""The first touch of a doctype in a process costs an extra `SELECT is_virtual`,
		unrelated to row count — warm it so it cannot read as scaling."""
		for dt in doctypes:
			frappe.get_all(dt, limit=1)


class TestMyRegistrationsCost(_Fixture):
	def test_the_cost_does_not_grow_with_the_number_of_registrations(self):
		for i in range(3):
			self._register(self._event(f"ev {i}").name, LEARNER)
		frappe.set_user(LEARNER)
		self._warm("Vernon Event Registration", "Vernon Event")
		my_registrations()
		few, rows_few = self._capture(my_registrations)

		frappe.set_user("Administrator")
		for i in range(3, 9):
			self._register(self._event(f"ev {i}").name, LEARNER)
		frappe.set_user(LEARNER)
		many, rows_many = self._capture(my_registrations)

		self.assertGreater(len(few), 0, "the counter is not observing anything")
		self.assertEqual(len(rows_few), 3)
		self.assertEqual(len(rows_many), 9)
		self.assertEqual(len(few), len(many),
			f"my_registrations must not query per registration: 3 cost {len(few)}, 9 cost {len(many)}")

	def test_each_registration_still_carries_its_event_title_and_start(self):
		ev = self._event("Kopdar")
		self._register(ev.name, LEARNER)
		frappe.set_user(LEARNER)
		rows = my_registrations()
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["event_title"], "Kopdar")
		self.assertIsNotNone(rows[0]["start_datetime"], "the start time must still be resolved")


class TestEventRosterCost(_Fixture):
	def test_the_cost_does_not_grow_with_the_roster(self):
		ev = self._event("Besar")
		users = []
		for i in range(6):
			email = f"n1-roster-{i}@test.local"
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": f"R{i}",
				                "send_welcome_email": 0}).insert(ignore_permissions=True)
			users.append(email)
		for u in users[:2]:
			self._register(ev.name, u)
		self._warm("Vernon Event Registration", "User")
		event_roster(ev.name)
		few, rows_few = self._capture(lambda: event_roster(ev.name))

		for u in users[2:]:
			self._register(ev.name, u)
		many, rows_many = self._capture(lambda: event_roster(ev.name))

		self.assertEqual(len(rows_few), 2)
		self.assertEqual(len(rows_many), 6)
		self.assertEqual(len(few), len(many),
			f"event_roster must not query per attendee: 2 cost {len(few)}, 6 cost {len(many)}")
		self.assertTrue(all(r["full_name"] for r in rows_many), "every attendee keeps a display name")


class TestMyLearningCost(_Fixture):
	def test_the_cost_does_not_grow_with_the_number_of_enrollments(self):
		for i in range(2):
			self._enrol(self._course(f"c {i}").name, LEARNER)
		frappe.set_user(LEARNER)
		self._warm("Course Enrollment", "Course")
		my_learning()
		few, res_few = self._capture(my_learning)

		frappe.set_user("Administrator")
		for i in range(2, 8):
			self._enrol(self._course(f"c {i}").name, LEARNER)
		frappe.set_user(LEARNER)
		many, res_many = self._capture(my_learning)

		self.assertEqual(len(res_few["enrollments"]), 2)
		self.assertEqual(len(res_many["enrollments"]), 8)
		self.assertEqual(len(few), len(many),
			f"my_learning must not query per enrollment: 2 cost {len(few)}, 8 cost {len(many)}")
		self.assertTrue(all(e["course_title"] for e in res_many["enrollments"]),
			"every enrollment keeps its course title")


class TestManageCoursesCost(_Fixture):
	def test_the_cost_does_not_grow_with_the_number_of_courses(self):
		frappe.set_user("Administrator")
		base = len(manage_courses()["courses"])
		for i in range(2):
			self._enrol(self._course(f"mc {i}", lessons=2).name, LEARNER)
		self._warm("Course", "Course Enrollment", "Course Lesson")
		manage_courses()
		few, res_few = self._capture(manage_courses)

		for i in range(2, 8):
			self._enrol(self._course(f"mc {i}", lessons=2).name, LEARNER)
		many, res_many = self._capture(manage_courses)

		self.assertEqual(len(res_few["courses"]), base + 2)
		self.assertEqual(len(res_many["courses"]), base + 8)
		self.assertEqual(len(few), len(many),
			f"manage_courses must not query per course: {base + 2} cost {len(few)}, {base + 8} cost {len(many)}")

	def test_each_course_still_reports_its_lesson_and_enrollment_counts(self):
		frappe.set_user("Administrator")
		c = self._course("Counted", lessons=3)
		self._enrol(c.name, LEARNER, status="Completed")
		got = next(r for r in manage_courses()["courses"] if r["name"] == c.name)
		self.assertEqual(got["lesson_count"], 3)
		self.assertEqual(got["enrolled"], 1)
		self.assertEqual(got["completed"], 1, "completed is a subset of enrolled, not a separate group")


class TestCourseReportCost(_Fixture):
	def test_the_cost_does_not_grow_with_the_number_of_learners(self):
		frappe.set_user("Administrator")
		c = self._course("Reported")
		users = []
		for i in range(6):
			email = f"n1-report-{i}@test.local"
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": f"L{i}",
				                "send_welcome_email": 0}).insert(ignore_permissions=True)
			users.append(email)
		for u in users[:2]:
			self._enrol(c.name, u)
		self._warm("Course Enrollment", "User")
		course_report(c.name)
		few, res_few = self._capture(lambda: course_report(c.name))

		for u in users[2:]:
			self._enrol(c.name, u)
		many, res_many = self._capture(lambda: course_report(c.name))

		self.assertEqual(len(res_few["rows"]), 2)
		self.assertEqual(len(res_many["rows"]), 6)
		self.assertEqual(len(few), len(many),
			f"course_report must not query per learner: 2 cost {len(few)}, 6 cost {len(many)}")
		self.assertEqual(res_many["course_title"], "Reported")
		self.assertTrue(all(r["user_name"] for r in res_many["rows"]), "every learner keeps a name")
