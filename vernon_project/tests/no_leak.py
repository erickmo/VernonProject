# Copyright (c) 2026, Vernon and Contributors
"""Keep a test suite's writes off the live site.

Most of this app's test files are plain unittest.TestCase, which Frappe gives no
transaction handling at all, so everything they write lands permanently on
project.vernon.id. Cleaning up in tearDown is not enough on its own:
api/mobile.py::_notify calls frappe.db.commit() right after inserting a Vernon
Notification (deliberately -- it then enqueues a web push and the worker has to
be able to see the row), and a COMMIT discards every open savepoint. So any test
touching a notifying endpoint had its fixtures made permanent before its own
cleanup ever ran, and rolling back to a savepoint afterwards failed with
"SAVEPOINT does not exist".

NoLeakMixin therefore does both halves: it holds db.commit for the duration of
each test so the savepoint survives _notify, and rolls that savepoint back
afterwards so everything the test wrote is undone -- including whatever it
forgot to register for cleanup, which is how the leaks happened in the first
place.

Holding the commit is a test-only measure. _notify's commit is correct in
production; it has 28 call sites across 12 modules and changing it is a separate
decision with a much wider blast radius.

Usage -- put the mixin first, leave everything else in the file alone:

    from vernon_project.tests.no_leak import NoLeakMixin

    class TestThing(NoLeakMixin, unittest.TestCase):   # or FrappeTestCase
        ...

The suite's own frappe.db.commit() calls and its tearDown cleanup can stay:
while a test runs the commits are no-ops and the deletes are simply undone with
everything else.

WHAT IT CANNOT UNDO: a test that writes from a SECOND database connection (a
thread that calls frappe.connect() and commits). Those rows are committed by a
different session and no savepoint of ours reaches them -- such a test still
has to delete what it created. Worse, holding the commit BREAKS such a test
outright: the second connection can never see what this one wrote, so the lock
contention or hand-off it is pinning never happens. Mark those with
@needs_real_commits and give them real cleanup; do not put a whole concurrency
suite (test_spend_races, test_gift_points_lock_order, test_priority_slots) on
the mixin at all.

Set VP_LEAK_COUNT=1 on a run to report the rows the suite WOULD have written to
the live site if it were not isolated -- that is the per-suite leak measurement.
"""

import atexit
import os
import re

import frappe

SAVEPOINT = "vp_no_leak"


def needs_real_commits(fn):
	"""Exempt ONE test from the isolation because it uses a second connection.

	A test that drives real lock contention or a cross-session hand-off has to
	actually commit, or the other connection sees nothing and the thing under
	test never happens. Such a test is responsible for its own cleanup, by
	name. Use this sparingly -- it is an opt-out from the leak protection.
	"""
	fn.vp_real_commits = True
	return fn


class NoLeakMixin:
	"""Wraps every test in hold-commit + savepoint + rollback.

	Overrides run() rather than setUp/tearDown so a suite needs no other edit,
	and so the isolation still holds for a test whose own setUp raises.
	"""

	def run(self, result=None):
		if os.environ.get("VP_LEAK_COUNT"):
			_start_counting()

		if getattr(getattr(self, self._testMethodName, None), "vp_real_commits", False):
			return super().run(result)

		real_commit = frappe.db.commit
		frappe.db.commit = lambda *a, **kw: None
		frappe.db.savepoint(SAVEPOINT)
		try:
			return super().run(result)
		finally:
			try:
				frappe.db.rollback(save_point=SAVEPOINT)
			except Exception:
				# A test that called a bare frappe.db.rollback() has already
				# discarded the savepoint -- and rolled its writes back with it.
				frappe.db.rollback()
			finally:
				frappe.db.commit = real_commit


# --- measurement ------------------------------------------------------------
# Net rows per table straight off the cursor, so a fixture the test does clean
# up nets back to zero and only the genuine leak is reported.

_TABLE = re.compile(r"^\s*(insert(?:\s+ignore)?\s+into|delete\s+from)\s+(?:`([^`]+)`|(\w+))", re.I)
_rows = {}
_counting = False


def _start_counting():
	global _counting
	if _counting:
		return
	_counting = True
	real_sql = frappe.db.sql

	def counting_sql(query, *a, **kw):
		out = real_sql(query, *a, **kw)
		match = _TABLE.match(query if isinstance(query, str) else str(query))
		if match:
			verb = match.group(1).split()[0].lower()
			try:
				n = frappe.db._cursor.rowcount or 0
			except Exception:
				n = 0
			table = match.group(2) or match.group(3)
			_rows[table] = _rows.get(table, 0) + (n if verb == "insert" else -n)
		return out

	frappe.db.sql = counting_sql
	atexit.register(_report)


def _report():
	leaked = sorted(((v, k) for k, v in _rows.items() if v > 0), reverse=True)
	print(f"\nVP_LEAK_COUNT: {sum(v for v, _ in leaked)} rows would have hit the live site")
	for v, k in leaked:
		print(f"  {v:>6}  {k}")
