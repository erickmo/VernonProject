# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
import pymysql

from vernon_project.attendance.cuti_ledger import ensure_grant

# ponytail: one test, one contending connection, no fixtures.


class TestCutiGrantLock(unittest.TestCase):
    """ensure_grant() was a check-then-write: look for this year's Grant row, insert
    one if absent. `tabCuti Ledger` has no unique index and remaining() is SUM(days),
    so two callers racing there -- the nightly grant_annual_cuti overlapping HR's
    remint_grant, most plausibly -- both find nothing, both insert, and that
    employee's annual leave silently doubles.

    Proven before the fix with two independent connections: T1 saw 0 Grant rows,
    T2 saw 0 Grant rows, both inserts succeeded.

    This holds the advisory lock from a genuinely separate connection and asserts
    ensure_grant refuses rather than minting a second row. Remove the get_lock from
    ensure_grant and this test fails: the insert goes through and no error is raised.

    Uses a REAL Employee Profile in a far-future year. An invented employee looked
    tidier and made the test worthless -- the insert then failed on the Link to a
    non-existent profile, so the test passed on an unrelated exception and stayed
    green with the lock removed. Year 2099 holds no real ledger rows, and tearDown
    deletes anything this test created for that employee and year.
    """

    YEAR = 2099

    def setUp(self):
        frappe.set_user("Administrator")
        employees = frappe.get_all("Employee Profile", pluck="user", limit=1)
        if not employees or not employees[0]:
            self.skipTest("no Employee Profile on this site to probe with")
        self.employee = employees[0]
        self._other = None
        self._clean()

    def tearDown(self):
        if self._other:
            try:
                self._other.rollback()
                self._other.close()
            except Exception:
                pass
        self._clean()

    def _clean(self):
        for name in frappe.get_all(
            "Cuti Ledger", filters={"employee": self.employee, "year": self.YEAR}, pluck="name"
        ):
            frappe.delete_doc("Cuti Ledger", name, force=True, ignore_permissions=True)
        frappe.db.commit()

    def _grant_count(self):
        return frappe.db.count(
            "Cuti Ledger", {"employee": self.employee, "year": self.YEAR, "entry_type": "Grant"}
        )

    def test_concurrent_ensure_grant_cannot_double_the_quota(self):
        self.assertEqual(self._grant_count(), 0, "probe year should start clean")

        self._other = pymysql.connect(
            host=frappe.conf.db_host or "127.0.0.1",
            port=int(frappe.conf.db_port or 3306),
            user=frappe.conf.db_name,
            password=frappe.conf.db_password,
            database=frappe.conf.db_name,
        )
        cur = self._other.cursor()
        # T1 holds the per-(employee, year) lock, exactly as the fixed ensure_grant does.
        cur.execute("select get_lock(%s, 5)", (f"vernon_cuti:{self.employee}:{self.YEAR}",))
        self.assertEqual(cur.fetchone()[0], 1, "probe could not take the lock")

        # T2 must refuse, and refuse for THIS reason -- asserting a bare Exception is
        # what let the first version of this test pass with the lock removed.
        with self.assertRaises(frappe.ValidationError) as caught:
            ensure_grant(self.employee, self.YEAR)
        self.assertIn("sedang diproses", str(caught.exception))

        self.assertEqual(
            self._grant_count(), 0, "ensure_grant minted a Grant row through a held lock"
        )


if __name__ == "__main__":
    unittest.main()
