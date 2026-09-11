# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
import pymysql

from vernon_project.attendance.cuti_ledger import remaining

# ponytail: one file, one contending connection, no fixtures.


class TestCutiSpendLock(unittest.TestCase):
    """The cuti SPEND gate was a check-then-write, the mirror of the grant-side race
    fixed in 8487eae.

    AttendanceException._check_leave_quota reads remaining() = SUM(days), compares,
    and the debit is minted later in on_update -> sync_cuti. `tabCuti Ledger` has no
    unique index, and leave_quota.check_request DELIBERATELY lets two overlapping
    requests reach Pending -- its own comment names this gate as the only backstop.
    So two HR approvals racing both read the same balance, both pass, and the
    employee spends the quota twice: 5 days left, two 5-day requests, both approved,
    ledger ends at -5.

    An advisory lock (ensure_grant's idiom) does NOT close this, which is why the fix
    is a LOCKING read instead. Two independent reasons, one test each:

      test_plain_read_is_stale_but_for_update_is_fresh
        InnoDB runs REPEATABLE READ, so a plain SELECT returns the snapshot this
        connection took at its first read. The second approver would win a get_lock()
        and still sum a pre-race ledger. Deterministic -- no timing, no sleep.

      test_for_update_blocks_while_another_approval_holds_the_row
        get_lock() is released when the function returns, which is BEFORE the request
        commits, so the loser can read a ledger the winner's debit is not in yet. Row
        locks are held to COMMIT, so the loser blocks instead.

    Both use a genuinely separate connection. Do NOT fake this by monkeypatching
    frappe.db.sql -- remaining() makes real queries, and a global patch hangs this
    bench. Uses a REAL Employee Profile (an invented one makes inserts fail on the
    Link and the test passes for the wrong reason -- the lesson from
    test_cuti_grant_lock). Year 2098 holds no real rows; tearDown removes what it made.
    """

    YEAR = 2098
    ROW = "TESTCUTISPENDLOCK"

    def setUp(self):
        frappe.set_user("Administrator")
        employees = frappe.get_all("Employee Profile", pluck="user", limit=1)
        if not employees or not employees[0]:
            self.skipTest("no Employee Profile on this site to probe with")
        self.employee = employees[0]
        self._other = None
        self._orig_timeout = frappe.db.sql("select @@session.innodb_lock_wait_timeout")[0][0]
        self._clean()

    def tearDown(self):
        # Release the contending connection FIRST: _clean() deletes rows it may hold.
        if self._other:
            try:
                self._other.rollback()
                self._other.close()
            except Exception:
                pass
        frappe.db.rollback()
        frappe.db.sql(f"set session innodb_lock_wait_timeout={int(self._orig_timeout)}")
        self._clean()

    def _clean(self):
        frappe.db.sql(
            "delete from `tabCuti Ledger` where employee=%s and year=%s",
            (self.employee, self.YEAR),
        )
        frappe.db.commit()

    def _conn(self):
        self._other = pymysql.connect(
            host=frappe.conf.db_host or "127.0.0.1",
            port=int(frappe.conf.db_port or 3306),
            user=frappe.conf.db_name,
            password=frappe.conf.db_password,
            database=frappe.conf.db_name,
        )
        return self._other

    def _seed(self, days):
        frappe.db.sql(
            "insert into `tabCuti Ledger` (name, employee, entry_type, year, days) "
            "values (%s, %s, 'Grant', %s, %s)",
            (self.ROW, self.employee, self.YEAR, days),
        )
        frappe.db.commit()

    def test_plain_read_is_stale_but_for_update_is_fresh(self):
        # This first read pins this connection's REPEATABLE READ snapshot, standing in
        # for the reads an approval request makes before it reaches the quota gate.
        self.assertEqual(remaining(self.employee, self.YEAR), 0, "probe year should start clean")

        # A competing approval commits its debit from a genuinely separate connection.
        conn = self._conn()
        cur = conn.cursor()
        cur.execute(
            "insert into `tabCuti Ledger` (name, employee, entry_type, year, days) "
            "values (%s, %s, 'Grant', %s, 10)",
            (self.ROW + "B", self.employee, self.YEAR),
        )
        conn.commit()

        self.assertEqual(
            remaining(self.employee, self.YEAR),
            0,
            "plain read is no longer a snapshot read -- if this starts failing the "
            "isolation level changed and the for_update rationale needs revisiting",
        )
        self.assertEqual(
            remaining(self.employee, self.YEAR, for_update=True),
            10,
            "locking read did not see the committed row; the approval gate would "
            "still pass on a stale balance and double-spend the quota",
        )

    def test_for_update_blocks_while_another_approval_holds_the_row(self):
        # Seed a REAL row: InnoDB lets two transactions hold the same GAP lock, so on
        # an empty range nothing would block and this test would quietly prove nothing.
        self._seed(12)

        conn = self._conn()
        cur = conn.cursor()
        cur.execute("start transaction")
        cur.execute(
            "select days from `tabCuti Ledger` where employee=%s and year=%s for update",
            (self.employee, self.YEAR),
        )
        self.assertEqual(len(cur.fetchall()), 1, "probe did not lock the ledger row")

        frappe.db.sql("set session innodb_lock_wait_timeout=3")
        with self.assertRaises(Exception) as caught:
            remaining(self.employee, self.YEAR, for_update=True)
        # Specific, not a bare Exception: asserting any Exception is what let the first
        # version of test_cuti_grant_lock pass with its lock removed.
        self.assertIn("lock wait timeout", str(caught.exception).lower())

        frappe.db.rollback()
        # The snapshot read must stay non-blocking: the HR screens and boot payload
        # read this ledger constantly and must not queue behind an approval in flight.
        self.assertEqual(remaining(self.employee, self.YEAR), 12)


    def test_the_approval_gate_itself_takes_the_lock(self):
        """The call site, not just remaining(). Drop `for_update=True` from
        _check_leave_quota and this is the test that goes red -- the two above would
        both still pass, because they exercise remaining() directly."""
        from vernon_project.vernon_project.doctype.attendance_exception import (
            attendance_exception as ae,
        )

        annual = ae.default_annual_type()
        if not annual:
            self.skipTest("no default annual Leave Type configured on this site")

        self._seed(12)
        conn = self._conn()
        cur = conn.cursor()
        cur.execute("start transaction")
        cur.execute(
            "select days from `tabCuti Ledger` where employee=%s and year=%s for update",
            (self.employee, self.YEAR),
        )
        self.assertEqual(len(cur.fetchall()), 1, "probe did not lock the ledger row")

        doc = frappe.new_doc("Attendance Exception")
        doc.employee = self.employee
        doc.exception_type = "Leave"
        doc.leave_type = annual
        doc.status = "Approved"
        doc.from_date = f"{self.YEAR}-06-01"
        doc.to_date = f"{self.YEAR}-06-01"

        # Local stub so the gate reaches the ledger read whether or not this probe
        # employee has a 2098 shift assignment. Deliberately NOT a global
        # frappe.db.sql patch -- that hangs this bench.
        original = ae.working_days
        ae.working_days = lambda employee, start, end: 1
        frappe.db.sql("set session innodb_lock_wait_timeout=3")
        try:
            with self.assertRaises(Exception) as caught:
                doc._check_leave_quota()
        finally:
            ae.working_days = original
        self.assertIn("lock wait timeout", str(caught.exception).lower())


if __name__ == "__main__":
    unittest.main()
