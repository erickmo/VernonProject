# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""Owner rule (todo ovr4r7dvg6): a todo someone creates today cannot already be
in the past.

    todo regulation:
    - the start date must be >= today
    - deadline must be >= today
    - deadline >= start date

The third rule already shipped (validate_start_date, on every save). These tests
cover the first two -- and, just as importantly, the two things the guard must NOT
break: an existing past-dated todo has to stay editable, and the server-side
inserters (nightly recurrence, patches, bench calls, fixtures) have to keep
creating back-dated rows. So the guard binds `before_insert` and only an insert
made under a real HTTP request, which is exactly what the sibling
refuse_duplicate_save guard does and for the same reason.

Because of that exemption these tests have to stand in for a browser: a plain
fixture insert is EXEMPT and would pass no matter what the guard says. Every
rejection case below therefore fakes frappe.local.request, and the two exemption
tests prove the fake is what makes the difference.
"""

import itertools
import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.tests.no_leak import NoLeakMixin

DETAIL = "PD-PRJ-2601-00002-00005"
ASSIGNEE = "mo@vernon.id"
TITLE = "ZZ create-date-window probe"
GROUP = "Engineering"
LEVEL = "41bb5abde7"
START_MSG = "Tanggal mulai tidak boleh sebelum hari ini."
DEADLINE_MSG = "Deadline tidak boleh sebelum hari ini."
# Module-level, not per-test: the duplicate-save guard remembers an identity for 15s,
# so a title reused by a LATER test in the same run would trip that guard instead.
_SEQ = itertools.count(1)


def _payload(**over):
	base = {
		"doctype": "Project Todo",
		"project_detail": DETAIL,
		"to_do": TITLE,
		"assigned_to": ASSIGNEE,
		"status": "⚪️ Planned",
		"group": GROUP,
		"level_id": LEVEL,
		"estimated": 60,
		"start_date": nowdate(),
		"deadline": nowdate(),
	}
	base.update(over)
	return base


def _count_queries(fn):
	"""Same technique as tests/test_security_perf.py: patch the class method so
	queries made deep inside frappe's own ORM are counted too."""
	queries = []
	orig_sql = frappe.db.__class__.sql

	def _counted(*args, **kwargs):
		ret = orig_sql(*args, **kwargs)
		queries.append(1)
		return ret

	frappe.db.__class__.sql = _counted
	try:
		fn()
	finally:
		frappe.db.__class__.sql = orig_sql
	return len(queries)


class TestCreateDateWindow(NoLeakMixin, unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.today = nowdate()
		self.yesterday = add_days(self.today, -1)
		self.tomorrow = add_days(self.today, 1)
		self.next_week = add_days(self.today, 7)
		self._begin_request()

	def tearDown(self):
		self._end_request()
		frappe.db.rollback()

	# A browser stand-in. Without this the insert is exempt and nothing is tested.
	def _begin_request(self):
		frappe.local.request = frappe._dict(method="POST", path="/api/method/frappe.client.insert")
		frappe.local.flags.pop("vp_todo_saves_seen", None)

	def _end_request(self):
		frappe.local.request = None
		frappe.local.flags.pop("vp_todo_saves_seen", None)

	def _fresh_request(self):
		"""Each create is its own logical save. The sibling duplicate-save guard keys
		on the payload for 15s, so every create here also gets a unique title -- else
		THAT guard answers and these tests pass for the wrong reason."""
		frappe.local.flags.pop("vp_todo_saves_seen", None)
		return f"{TITLE} {next(_SEQ)}"

	def _build(self, **over):
		over.setdefault("to_do", self._fresh_request())
		return frappe.get_doc(_payload(**over))

	def _insert(self, **over):
		return self._build(**over).insert(ignore_permissions=True)

	# --- rejects -------------------------------------------------------------

	def test_rejects_start_date_yesterday(self):
		with self.assertRaises(frappe.ValidationError) as cm:
			self._insert(start_date=self.yesterday, deadline=self.tomorrow)
		self.assertIn(START_MSG, str(cm.exception))

	def test_rejects_deadline_yesterday(self):
		"""Isolated from the start-date half: start_date is today, so only the
		deadline check can refuse it. Asserting the deadline wording pins WHICH
		guard answered. validate_start_date ALSO objects to this pair, and its message
		("Start Date cannot be after the Deadline") contains the word "deadline" -- so
		anything looser than the exact message passes on the old guard and proves
		nothing about the new one."""
		with self.assertRaises(frappe.ValidationError) as cm:
			self._insert(start_date=self.today, deadline=self.yesterday)
		self.assertIn(DEADLINE_MSG, str(cm.exception))

	def test_rejects_deadline_before_start_date(self):
		"""Rule 3, already shipped -- pinned here so the set is complete."""
		with self.assertRaises(frappe.ValidationError) as cm:
			self._insert(start_date=self.next_week, deadline=self.tomorrow)
		self.assertIn("Start Date cannot be after the Deadline", str(cm.exception))

	# --- accepts -------------------------------------------------------------

	def test_accepts_start_date_equal_to_today(self):
		doc = self._insert(start_date=self.today, deadline=self.next_week)
		self.assertEqual(str(doc.start_date), self.today)

	def test_accepts_deadline_equal_to_today_when_start_is_today(self):
		doc = self._insert(start_date=self.today, deadline=self.today)
		self.assertEqual(str(doc.deadline), self.today)

	def test_accepts_equal_future_start_and_deadline(self):
		doc = self._insert(start_date=self.next_week, deadline=self.next_week)
		self.assertEqual(str(doc.start_date), self.next_week)
		self.assertEqual(str(doc.deadline), self.next_week)

	def test_accepts_ordered_future_range_and_round_trips(self):
		doc = self._insert(start_date=self.tomorrow, deadline=self.next_week)
		saved = frappe.db.get_value(
			"Project Todo", doc.name, ["start_date", "deadline"], as_dict=True
		)
		self.assertEqual(str(saved.start_date), self.tomorrow)
		self.assertEqual(str(saved.deadline), self.next_week)

	# --- what the guard must NOT break ---------------------------------------

	def test_existing_past_dated_todo_still_saves(self):
		"""The reason this is before_insert and not validate. Hundreds of live todos
		have dates in the past; editing one must not start throwing."""
		self._end_request()                      # created server-side, exempt
		doc = self._insert(start_date=add_days(self.today, -30), deadline=self.yesterday)
		self._begin_request()                    # now edit it from a browser
		doc.reload()
		doc.notes = "edited from the UI"
		doc.save(ignore_permissions=True)
		self.assertEqual(
			frappe.db.get_value("Project Todo", doc.name, "notes"), "edited from the UI"
		)

	def test_server_side_insert_without_a_request_is_exempt(self):
		"""The nightly scheduler, patches and bench calls create back-dated todos."""
		self._end_request()
		doc = self._insert(start_date=self.yesterday, deadline=self.yesterday)
		self.assertTrue(frappe.db.exists("Project Todo", doc.name))

	def test_recurring_occurrence_is_exempt_even_under_a_request(self):
		"""build_occurrence fires under a real request when someone completes a
		recurring todo, and a series that is behind produces a past rule date.
		Blocking it would silently kill the series."""
		anchor = self._insert(start_date=self.today, deadline=self.today)
		doc = self._insert(
			start_date=self.yesterday,
			deadline=self.yesterday,
			original_todo=anchor.name,
		)
		self.assertTrue(frappe.db.exists("Project Todo", doc.name))

	# --- cost ----------------------------------------------------------------

	def test_guard_adds_no_queries(self):
		"""The guard is a date comparison against nowdate(); it must not read the DB.
		A rejected create does its work before any INSERT, so it is strictly cheaper
		than a valid one -- if the guard ever grows a lookup, this inverts."""
		ok = self._build(start_date=self.today, deadline=self.next_week)
		valid = _count_queries(lambda: ok.insert(ignore_permissions=True))
		bad = self._build(start_date=self.yesterday, deadline=self.tomorrow)

		def _rejected():
			try:
				bad.insert(ignore_permissions=True)
			except frappe.ValidationError:
				pass

		self.assertLess(_count_queries(_rejected), valid)
