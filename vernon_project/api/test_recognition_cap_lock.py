# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
import pymysql
from frappe.utils import add_days, now_datetime, nowdate

from vernon_project.api.mobile import _lock_giver_recognition, _recognition_cap_reached
from vernon_project.api.superpowers import _upsert_vote

# ponytail: one file, one contending connection, no fixtures.


class TestRecognitionCapLock(unittest.TestCase):
    """The recognition weekly cap was a count-then-insert, and the cap is a SECURITY
    control, not an accounting nicety: superpowers.py's own comment records that it
    was added in the 2026-09-09 permission sweep because colluding low-privilege
    accounts could otherwise farm unlimited quarterly points for a favoured user.

    N concurrent grants from ONE giver all counted the same total, all passed a cap
    of N-1, and all inserted -- so the race re-opened exactly the hole the cap closed.
    On the reaction path the count is not even stale (mobile.py commits before it
    credits): both callers read an accurate count, both read it BEFORE either
    inserts. Freshness was never the missing piece; MUTUAL EXCLUSION was.

    _lock_giver_recognition supplies it with `for update`, whose row locks are held
    until COMMIT. An advisory lock would not: it releases when the function returns,
    before the request commits, so the loser could still count a ledger without the
    winner's row in it.

    The duplicate-vote half is backstopped by a UNIQUE index instead of a lock --
    isolation-independent, and it covers every write path rather than one endpoint.
    """

    QUARTER = "2098-Q1"
    PROBE = "TESTRECOGCAP"
    INDEX = "unique_vote_per_quarter"

    def setUp(self):
        frappe.set_user("Administrator")
        users = frappe.get_all("User", filters={"enabled": 1}, pluck="name", limit=2)
        if len(users) < 2:
            self.skipTest("need two real Users to probe with")
        self.voter, self.ratee = users[0], users[1]
        self._other = None
        self._created_index = False
        self._orig_timeout = frappe.db.sql("select @@session.innodb_lock_wait_timeout")[0][0]
        self._clean()

    def tearDown(self):
        # Release the contending connection FIRST -- _clean() deletes rows it may hold.
        if self._other:
            try:
                self._other.rollback()
                self._other.close()
            except Exception:
                pass
        frappe.db.rollback()
        frappe.db.sql(f"set session innodb_lock_wait_timeout={int(self._orig_timeout)}")
        self._clean()
        if self._created_index:
            # Only drop what THIS test created; a migrated site already owns it.
            frappe.db.sql(f"alter table `tabSuperpower Vote` drop index `{self.INDEX}`")
            frappe.db.commit()

    def _clean(self):
        frappe.db.sql("delete from `tabPoint Ledger` where name like %s", (self.PROBE + "%",))
        frappe.db.sql("delete from `tabSuperpower Vote` where quarter=%s", (self.QUARTER,))
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

    def _seed_grant(self, suffix="A", when=None):
        frappe.db.sql(
            "insert into `tabPoint Ledger` (name, `user`, granted_by, source, points_earned, credited_on) "
            "values (%s, %s, %s, 'Recognition', 1, %s)",
            (self.PROBE + suffix, self.ratee, self.voter, when or now_datetime()),
        )
        frappe.db.commit()

    def _has_index(self):
        return bool(
            frappe.db.sql(
                "select 1 from information_schema.statistics where table_schema=database() "
                "and table_name='tabSuperpower Vote' and index_name=%s limit 1",
                (self.INDEX,),
            )
        )

    def test_cap_read_blocks_while_another_grant_holds_the_giver_rows(self):
        # A REAL row, not an empty range: InnoDB lets two transactions hold the same
        # GAP lock, so with no rows nothing would block and this would prove nothing.
        self._seed_grant()

        conn = self._conn()
        cur = conn.cursor()
        cur.execute("start transaction")
        cur.execute(
            "select name from `tabPoint Ledger` where granted_by=%s "
            "and source in ('Recognition','Feedback') for update",
            (self.voter,),
        )
        self.assertGreaterEqual(len(cur.fetchall()), 1, "probe did not lock the giver's rows")

        frappe.db.sql("set session innodb_lock_wait_timeout=3")
        with self.assertRaises(Exception) as caught:
            _lock_giver_recognition(self.voter)
        # Specific, not a bare Exception: asserting any Exception is what let the first
        # version of test_cuti_grant_lock pass with its lock removed.
        self.assertIn("lock wait timeout", str(caught.exception).lower())

    def test_cap_counts_only_recognition_inside_the_rolling_window(self):
        stale = frappe.utils.get_datetime(add_days(nowdate(), -30))
        rows = [
            frappe._dict(source="Recognition", credited_on=now_datetime()),
            frappe._dict(source="Recognition", credited_on=now_datetime()),
            frappe._dict(source="Recognition", credited_on=stale),      # outside window
            frappe._dict(source="Feedback", credited_on=now_datetime()),  # not capped
        ]
        self.assertFalse(_recognition_cap_reached(rows, 3), "window/source filter dropped too few")
        self.assertTrue(_recognition_cap_reached(rows, 2), "cap should trip on the 2 in-window grants")
        self.assertFalse(_recognition_cap_reached(rows, 0), "cap <= 0 disables the cap")

    def test_duplicate_vote_is_rejected_by_the_index_and_the_upsert_recovers(self):
        superpower = frappe.get_all("Superpower", pluck="name", limit=1)
        if not superpower:
            self.skipTest("no Superpower on this site to probe with")
        sp = superpower[0]

        if not self._has_index():
            # Proves the live table is clean enough for the migration to succeed --
            # the exact risk flagged before shipping the index.
            frappe.db.add_unique(
                "Superpower Vote", ["ratee", "voter", "superpower", "quarter"],
                constraint_name=self.INDEX,
            )
            self._created_index = True
        frappe.db.commit()

        # Pin this connection's snapshot, standing in for the read _upsert_vote makes
        # before it decides to insert.
        self.assertIsNone(
            frappe.db.exists(
                "Superpower Vote",
                {"ratee": self.ratee, "voter": self.voter, "superpower": sp, "quarter": self.QUARTER},
            ),
            "probe quarter should start clean",
        )

        # The racing voter wins, from a genuinely separate connection.
        conn = self._conn()
        cur = conn.cursor()
        cur.execute(
            "insert into `tabSuperpower Vote` (name, ratee, voter, superpower, score, quarter) "
            "values (%s, %s, %s, %s, 1, %s)",
            (self.PROBE + "V", self.ratee, self.voter, sp, self.QUARTER),
        )
        conn.commit()

        # The loser must not 500: it takes the DuplicateEntryError and updates instead.
        _upsert_vote(self.ratee, self.voter, sp, self.QUARTER, 3)
        frappe.db.commit()

        rows = frappe.db.sql(
            "select score from `tabSuperpower Vote` where ratee=%s and voter=%s "
            "and superpower=%s and quarter=%s",
            (self.ratee, self.voter, sp, self.QUARTER),
        )
        self.assertEqual(len(rows), 1, "duplicate vote row survived the unique index")
        self.assertEqual(int(rows[0][0]), 3, "the loser's score did not land on the winner's row")


if __name__ == "__main__":
    unittest.main()
