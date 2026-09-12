# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""A leaked fixture account must never appear on the leaderboard.

Test suites here commit to the live database, so Point Ledger rows for accounts
that only ever existed for a test outlive their teardown. On 2026-09-12 two of
them were sitting on the live monthly productivity board, ranked against real
employees. example.com is reserved by RFC 2606 — no real account can hold one —
so excluding it from the ranking is correct permanently, not a workaround for
the cleanup that still has to happen.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate

from vernon_project.api.mobile import get_leaderboard
from vernon_project.fixtures_for_tests import ensure_user

FIXTURE = "lbfix_ghost@example.com"
REAL = "lbfix_person@vernon.test"


def _entries(res):
	return [e["user"] for e in (res or {}).get("entries", [])]


class TestLeaderboardExcludesFixtureAccounts(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		ensure_user(FIXTURE)
		ensure_user(REAL)
		# Enough points to land at the top of any real board, so "absent" cannot be
		# confused with "ranked below the top 50".
		# Two sources on purpose. The board has two dimensions and they read
		# DIFFERENT sources: productivity counts work (Todo), character counts
		# Recognition and Mentoring. Seeding only Todo made the character subtests
		# pass vacuously — the fixture was absent there because it had no points of
		# that kind, not because the filter worked.
		self.rows = [
			frappe.get_doc({
				"doctype": "Point Ledger", "user": user, "points_earned": points,
				"point": points, "source": source, "credited_on": nowdate(),
			}).insert(ignore_permissions=True)
			for user, points in ((FIXTURE, 999999), (REAL, 999998))
			for source in ("Todo", "Recognition")
		]

	def tearDown(self):
		frappe.set_user("Administrator")
		for row in self.rows:
			if frappe.db.exists("Point Ledger", row.name):
				frappe.delete_doc("Point Ledger", row.name, force=True, ignore_permissions=True)

	def test_a_leaked_fixture_account_is_not_on_the_board(self):
		self.assertNotIn(FIXTURE, _entries(get_leaderboard()))

	def test_a_real_account_with_the_same_points_still_is(self):
		"""The filter must remove fixtures, not points in general."""
		self.assertIn(REAL, _entries(get_leaderboard()))

	def test_it_holds_for_every_period_and_dimension(self):
		for period in ("weekly", "monthly", "all"):
			for dimension in ("productivity", "character"):
				with self.subTest(period=period, dimension=dimension):
					self.assertNotIn(FIXTURE, _entries(get_leaderboard(period=period, dimension=dimension)))

	def test_the_fixture_account_is_not_smuggled_in_as_the_caller_row(self):
		"""get_leaderboard also returns the CALLER's own row wherever it ranks, on a
		separate path from the top-50 list — so the filter has to cover that too, or
		a fixture account still sees itself ranked."""
		frappe.set_user(FIXTURE)
		try:
			res = get_leaderboard()
		finally:
			frappe.set_user("Administrator")
		self.assertIsNone(res.get("me"), "a fixture account was ranked as the caller")
