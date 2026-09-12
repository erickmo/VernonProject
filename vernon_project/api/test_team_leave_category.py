# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api.attendance import team_leave
from vernon_project.tests.no_leak import NoLeakMixin

SUBJECT = "team-leave-subject@test.local"
STRANGER = "team-leave-stranger@test.local"


class TestTeamLeaveCategory(NoLeakMixin, unittest.TestCase):
	"""team_leave() fed every logged-in user each colleague's leave CATEGORY by name
	and date. On this site that catalogue is a medical fact for half its entries
	(Cuti Sakit, Cuti Keguguran, Cuti Haid, Cuti Melahirkan) and a religious one for
	two more (Cuti Khitan Anak, Cuti Baptis Anak), so the category is the sensitive
	half — not the harmless half its docstring called it.

	The module already treats a category as personal in both directions:
	list_leave_types hides the other gender's types from the picker, and _exc_label
	collapses every category to "Cuti"/"WFH" in all three approval notifications.
	These tests pin the same treatment here.

	Two axes, and the second one guards rather than asserts (it passes against the
	unfixed code, which is the point — the fix must not cost the calendar anything):
	  SCOPE      — a stranger gets no category, the person keeps their own
	  REGRESSION — HR still sees every category, and every row still carries the
	               name and the span for everyone

	Nothing here commits: NoLeakMixin holds db.commit and rolls the savepoint back,
	so the two probe users and the approved leave never reach the live site.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		for email in (SUBJECT, STRANGER):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		# A non-default-annual type on purpose: AttendanceException._check_leave_quota
		# only gates the annual pool, so a Documented/Per-Event type approves without
		# needing a cuti balance to exist for the probe user.
		self.leave_type = frappe.db.get_value(
			"Leave Type", {"enabled": 1, "is_default_annual": 0}, "name"
		)
		if not self.leave_type:
			self.skipTest("site has no enabled non-annual leave type to probe with")
		today = frappe.utils.nowdate()
		self.exc = frappe.get_doc({
			"doctype": "Attendance Exception",
			"employee": SUBJECT,
			"exception_type": "Leave",
			"leave_type": self.leave_type,
			"from_date": today,
			"to_date": today,
			"status": "Approved",
			"hr_decision": "Approved",
			"reason": "team_leave category probe",
		}).insert(ignore_permissions=True).name

	def tearDown(self):
		frappe.set_user("Administrator")

	def _my_row(self):
		rows = team_leave()["rows"]
		return next((r for r in rows if r["name"] == self.exc), None)

	# --- SCOPE ------------------------------------------------------------------

	def test_a_stranger_gets_the_span_but_not_the_category(self):
		frappe.set_user(STRANGER)
		row = self._my_row()
		self.assertIsNotNone(row, "the leave must still appear on the shared calendar")
		self.assertIsNone(
			row["leave_type"],
			"a colleague's leave category is medical or religious data; the calendar "
			"only needs to say someone is out",
		)
		# the lens keeps working: who, and when
		self.assertEqual(row["employee"], SUBJECT)
		self.assertTrue(row["employee_name"])
		self.assertTrue(row["from_date"] and row["to_date"])

	def test_the_person_themselves_still_sees_their_own_category(self):
		frappe.set_user(SUBJECT)
		row = self._my_row()
		self.assertIsNotNone(row)
		self.assertEqual(row["leave_type"], self.leave_type)

	# --- REGRESSION -------------------------------------------------------------

	def test_hr_still_sees_every_category(self):
		frappe.set_user("Administrator")  # System Manager, so _is_hr() is True
		row = self._my_row()
		self.assertIsNotNone(row)
		self.assertEqual(row["leave_type"], self.leave_type)

	def test_no_row_is_dropped_for_a_stranger(self):
		frappe.set_user("Administrator")
		hr_names = {r["name"] for r in team_leave()["rows"]}
		frappe.set_user(STRANGER)
		stranger_names = {r["name"] for r in team_leave()["rows"]}
		self.assertEqual(
			hr_names, stranger_names,
			"hiding the category must not hide the leave — the calendar would lose days",
		)
