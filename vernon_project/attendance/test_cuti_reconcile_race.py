# Copyright (c) 2026, Vernon and contributors
# See license.txt

import threading
import unittest

import frappe

from vernon_project.attendance import leave_rules
from vernon_project.attendance.cuti_ledger import reconcile_signed

ENTRY_TYPE = "Overtime Bonus"
THRESHOLD = 480
REASON = "Auto: approved overtime accrual"

_SETTINGS = {
	"late_penalty_enabled": False,
	"count_early_leave_in_penalty": False,
	"lateness_deduction_threshold_minutes": THRESHOLD,
	"overtime_bonus_enabled": True,
	"overtime_bonus_threshold_minutes": THRESHOLD,
}


def _in_another_request(site, sites_path, fn):
	"""Run fn on an independent connection that COMMITs."""
	err = []

	def run():
		frappe.init(site=site, sites_path=sites_path)
		frappe.connect()
		try:
			frappe.set_user("Administrator")
			fn()
			frappe.db.commit()
		except Exception as e:  # surface it instead of a silent no-op
			err.append(repr(e))
		finally:
			frappe.destroy()

	t = threading.Thread(target=run)
	t.start()
	t.join(60)
	return t, err


class TestCutiReconcileRace(unittest.TestCase):
	"""reconcile_signed() forces the row count for (employee, year, entry_type) to a
	target. It counted with a plain get_all and then inserted/deleted the delta -- a
	check-then-write with no lock, on the same table and at the same REPEATABLE READ
	isolation that already doubled the annual Grant (see test_cuti_grant_lock).

	Two failures, and they are NOT the same bug:

	1. The COUNT is stale, so two callers both see 0 and both insert.
	2. The TARGET is stale, which no lock on the ledger can fix. reconcile_overtime
	   derives the target from a plain read of Overtime Entry, so two concurrent
	   deletes each still see the other's row and each reconcile to 1 -- leaving an
	   orphan bonus leave day for overtime that no longer exists.

	Settings are monkeypatched, never written: Vernon Settings is shared bench state.
	Year 2099 holds no real rows and tearDown removes everything created here.
	"""

	YEAR = 2099

	def setUp(self):
		frappe.set_user("Administrator")
		employees = frappe.get_all("Employee Profile", pluck="user", limit=1)
		if not employees or not employees[0]:
			self.skipTest("no Employee Profile on this site to probe with")
		self.employee = employees[0]
		self._real_resolve = leave_rules.resolve
		leave_rules.resolve = lambda employee: dict(_SETTINGS)
		self._clean()

	def tearDown(self):
		leave_rules.resolve = self._real_resolve
		self._clean()

	def _clean(self):
		# Rollback first: the contending request COMMITs on another connection after
		# this transaction took its snapshot, so a plain read here cannot see its rows
		# and would delete nothing. Same trap these tests are about.
		frappe.db.rollback()
		for name in frappe.get_all("Overtime Entry", filters={
			"employee": self.employee, "date": ["between", [f"{self.YEAR}-01-01", f"{self.YEAR}-12-31"]],
		}, pluck="name"):
			frappe.delete_doc("Overtime Entry", name, force=True, ignore_permissions=True)
		for name in frappe.get_all("Cuti Ledger", filters={
			"employee": self.employee, "year": self.YEAR,
		}, pluck="name"):
			frappe.delete_doc("Cuti Ledger", name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _bonus_count(self):
		frappe.db.rollback()  # fresh snapshot, so we read what is actually committed
		return frappe.db.count("Cuti Ledger", {
			"employee": self.employee, "year": self.YEAR, "entry_type": ENTRY_TYPE})

	def _add_overtime(self, day, minutes=THRESHOLD):
		return frappe.get_doc({
			"doctype": "Overtime Entry", "employee": self.employee,
			"date": f"{self.YEAR}-03-{day:02d}", "minutes": minutes,
			"reason": "ZZ reconcile-race probe", "status": "Approved",
		}).insert(ignore_permissions=True)

	def test_a_reconcile_racing_another_cannot_double_the_rows(self):
		"""Failure 1: the stale COUNT. Both callers see zero rows and both insert."""
		self.assertEqual(self._bonus_count(), 0, "probe year should start clean")
		frappe.db.sql("select name from `tabCuti Ledger` limit 1")  # pins the snapshot

		t, err = _in_another_request(
			frappe.local.site, frappe.local.sites_path,
			lambda: reconcile_signed(self.employee, self.YEAR, ENTRY_TYPE, 1, 1, REASON))
		self.assertFalse(t.is_alive(), "the other request hung")
		self.assertEqual(err, [], "the other request failed")

		reconcile_signed(self.employee, self.YEAR, ENTRY_TYPE, 1, 1, REASON)
		frappe.db.commit()
		self.assertEqual(self._bonus_count(), 1, "one bonus day was minted twice")

	def test_two_concurrent_overtime_deletes_do_not_leave_an_orphan_bonus_day(self):
		"""Failure 2: the stale TARGET. Both deletes still see the other's entry, so
		both reconcile to 1 and a bonus leave day survives with no overtime behind it.
		A lock around the ledger count cannot fix this -- the wrong number is the
		target, computed before the ledger is ever touched."""
		a = self._add_overtime(1)
		self._add_overtime(2)
		frappe.db.commit()
		self.assertEqual(self._bonus_count(), 2, "two approved days should mint two")

		b_name = frappe.get_all("Overtime Entry", filters={
			"employee": self.employee, "date": f"{self.YEAR}-03-02"}, pluck="name")[0]
		frappe.db.sql("select name from `tabOvertime Entry` limit 1")  # pins the snapshot

		t, err = _in_another_request(
			frappe.local.site, frappe.local.sites_path,
			lambda: frappe.delete_doc("Overtime Entry", b_name, force=True, ignore_permissions=True))
		self.assertFalse(t.is_alive(), "the other request hung")
		self.assertEqual(err, [], "the other request failed")

		frappe.delete_doc("Overtime Entry", a.name, force=True, ignore_permissions=True)
		frappe.db.commit()

		self.assertEqual(frappe.db.count("Overtime Entry", {
			"employee": self.employee,
			"date": ["between", [f"{self.YEAR}-01-01", f"{self.YEAR}-12-31"]]}), 0)
		self.assertEqual(self._bonus_count(), 0, "a bonus leave day outlived its overtime")


if __name__ == "__main__":
	unittest.main()
