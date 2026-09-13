# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.project_todo import reassign_series, stalled_series
from vernon_project.tests.no_leak import NoLeakMixin
from vernon_project.vernon_project.doctype.project_todo.project_todo import (
    ASSIGNEE_DISABLED,
    ASSIGNEE_OFF_TEAM,
    STALLED_SERIES_REF,
    series_assignee_problem,
    latest_occurrence,
)
from vernon_project.vernon_project.doctype.project_todo.test_project_todo import (
    _ensure_test_group,
)

LEADER = "stalled-series-leader@test.local"
WORKER = "stalled-series-worker@test.local"
OTHER = "stalled-series-other@test.local"


class TestStalledRecurringSeries(NoLeakMixin, unittest.TestCase):
    """A recurring series carries its assignee on each occurrence, and
    build_occurrence copies it off the anchor — so when that person is disabled
    or leaves the project team, every new occurrence fails
    validate_assigned_to_team_member, the nightly run logs it and rolls back,
    and the routine dies with nobody told.

    Offboarding makes that the NORMAL outcome rather than an edge case:
    user_offboarding._transfer_open_todos preserves history by skipping
    TERMINAL_STATUSES, and a healthy daily routine's latest occurrence is
    exactly that — Completed.

    The load-bearing test here is
    test_reassigning_does_not_rewrite_who_did_the_finished_work. Handing the
    series over by rewriting the finished occurrence's assigned_to would be the
    obvious implementation and would silently falsify the record that Point
    Ledger rows are attributed off.
    """

    def setUp(self):
        frappe.set_user("Administrator")
        self.group, self.level_id = _ensure_test_group()
        for email in (LEADER, WORKER, OTHER):
            if not frappe.db.exists("User", email):
                frappe.get_doc({
                    "doctype": "User", "email": email, "first_name": email.split("@")[0],
                    "send_welcome_email": 0,
                }).insert(ignore_permissions=True)
        frappe.get_doc("User", LEADER).add_roles("Project Owner", "Project Leader")
        brand = frappe.get_all("Brand", pluck="name", limit=1)
        if not brand:
            self.skipTest("site has no Brand")
        self.project = frappe.get_doc({
            "doctype": "Project", "project_name": "Stalled Series Probe",
            "brand": brand[0], "project_owner": LEADER, "project_leader": LEADER,
            "status": "Ongoing", "start_date": nowdate(),
            "deadline": add_days(nowdate(), 30),
            "team_members": [{"user": WORKER}, {"user": OTHER}],
        }).insert(ignore_permissions=True)
        grouping = frappe.get_doc({
            "doctype": "Glossary", "glossary": "Stalled Series Grouping",
            "project": self.project.name,
        }).insert(ignore_permissions=True)
        self.detail = frappe.get_doc({
            "doctype": "Project Detail", "project": self.project.name,
            "title": "Stalled Series Detail", "grouping": grouping.name,
            "project_deadline": add_days(nowdate(), 30), "estimated": 100,
        }).insert(ignore_permissions=True)

    def tearDown(self):
        frappe.set_user("Administrator")

    def _series(self, status="✅ Completed", assignee=WORKER):
        """A daily routine whose latest occurrence is already finished — the
        steady state of a working routine, and the case offboarding leaves behind."""
        doc = frappe.get_doc({
            "doctype": "Project Todo", "project_detail": self.detail.name,
            "to_do": "Buang sampah", "assigned_to": assignee,
            "start_date": add_days(nowdate(), -1), "deadline": add_days(nowdate(), -1),
            "estimated": 30, "status": "⚪️ Planned",
            "group": self.group, "level_id": self.level_id,
            "is_recurring": 1, "recurring_frequency": "Daily",
        }).insert(ignore_permissions=True)
        if status != "⚪️ Planned":
            frappe.db.set_value("Project Todo", doc.name, "status", status)
        return doc

    def _disable(self, user):
        frappe.db.set_value("User", user, "enabled", 0)

    def _off_team(self, user):
        frappe.db.delete("Project Team", {"parent": self.project.name, "user": user})

    # --- the shared predicate ---------------------------------------------------

    def test_a_healthy_series_has_no_problem(self):
        self.assertIsNone(series_assignee_problem(latest_occurrence(self._series().name)))

    def test_a_disabled_assignee_is_detected(self):
        s = self._series()
        self._disable(WORKER)
        self.assertEqual(
            series_assignee_problem(latest_occurrence(s.name)), ASSIGNEE_DISABLED
        )

    def test_an_off_team_assignee_is_detected(self):
        s = self._series()
        self._off_team(WORKER)
        self.assertEqual(
            series_assignee_problem(latest_occurrence(s.name)), ASSIGNEE_OFF_TEAM
        )

    # --- the nightly run alerts instead of dying silently -----------------------

    def test_the_scheduler_notifies_the_lead_and_creates_nothing(self):
        from vernon_project.tasks import create_recurring_todos
        s = self._series()
        self._disable(WORKER)
        create_recurring_todos(roots=[s.name])
        self.assertEqual(frappe.db.count("Project Todo", {"original_todo": s.name}), 0)
        notes = frappe.get_all("Vernon Notification", filters={
            "reference_doctype": STALLED_SERIES_REF, "reference_name": s.name,
            "recipient": LEADER,
        })
        self.assertEqual(len(notes), 1, "the lead must be told the routine stopped")

    def test_the_nightly_run_does_not_renotify_every_night(self):
        from vernon_project.tasks import create_recurring_todos
        s = self._series()
        self._disable(WORKER)
        create_recurring_todos(roots=[s.name])
        create_recurring_todos(roots=[s.name])
        notes = frappe.get_all("Vernon Notification", filters={
            "reference_doctype": STALLED_SERIES_REF, "reference_name": s.name,
        })
        self.assertEqual(len(notes), 1, "one notice per series, not one per night")

    # --- the lead's list --------------------------------------------------------

    def test_the_lead_sees_the_stalled_series(self):
        s = self._series()
        self._disable(WORKER)
        frappe.set_user(LEADER)
        rows = stalled_series()["rows"]
        frappe.set_user("Administrator")
        mine = [r for r in rows if r["series"] == s.name]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["reason"], ASSIGNEE_DISABLED)
        self.assertEqual(mine[0]["assigned_to"], WORKER)

    def test_someone_who_runs_no_project_sees_nothing(self):
        s = self._series()
        self._disable(WORKER)
        frappe.set_user(OTHER)
        rows = stalled_series()["rows"]
        frappe.set_user("Administrator")
        self.assertEqual([r for r in rows if r["series"] == s.name], [])

    # --- reassignment -----------------------------------------------------------

    def test_reassigning_does_not_rewrite_who_did_the_finished_work(self):
        s = self._series()
        self._disable(WORKER)
        frappe.set_user(LEADER)
        reassign_series(s.name, OTHER)
        frappe.set_user("Administrator")
        self.assertEqual(
            frappe.db.get_value("Project Todo", s.name, "assigned_to"), WORKER,
            "the finished occurrence records who really did it — Point Ledger "
            "rows are attributed off it",
        )

    def test_reassigning_restarts_the_series_on_the_new_person(self):
        s = self._series()
        self._disable(WORKER)
        frappe.set_user(LEADER)
        res = reassign_series(s.name, OTHER)
        frappe.set_user("Administrator")
        self.assertTrue(res["next"])
        kids = frappe.get_all("Project Todo", filters={"original_todo": s.name},
                              fields=["assigned_to", "deadline"])
        self.assertEqual(len(kids), 1)
        self.assertEqual(kids[0].assigned_to, OTHER)
        self.assertEqual(str(kids[0].deadline), nowdate())
        self.assertIsNone(series_assignee_problem(latest_occurrence(s.name)))

    def test_a_non_lead_cannot_reassign(self):
        s = self._series()
        self._disable(WORKER)
        frappe.set_user(OTHER)
        with self.assertRaises(frappe.PermissionError):
            reassign_series(s.name, OTHER)
        frappe.set_user("Administrator")

    def test_the_new_assignee_must_be_on_the_team(self):
        s = self._series()
        self._disable(WORKER)
        frappe.set_user(LEADER)
        with self.assertRaises(frappe.ValidationError):
            reassign_series(s.name, "Administrator")
        frappe.set_user("Administrator")

    def test_an_open_anchor_is_handed_over_without_spawning_a_duplicate(self):
        s = self._series(status="⚪️ Planned")
        self._off_team(WORKER)
        frappe.set_user(LEADER)
        reassign_series(s.name, OTHER)
        frappe.set_user("Administrator")
        self.assertEqual(
            frappe.db.get_value("Project Todo", s.name, "assigned_to"), OTHER,
            "live work is handed over in place",
        )
        self.assertEqual(
            frappe.db.count("Project Todo", {"original_todo": s.name}), 0,
            "handing over live work must not also spawn a successor",
        )

    # --- offboarding stops creating stalled series ------------------------------

    def test_offboarding_rehomes_the_routine_to_the_lead(self):
        from vernon_project.user_offboarding import _rehome_recurring_series
        s = self._series()
        self._disable(WORKER)
        frappe.db.delete("Project Team", {"user": WORKER, "parenttype": "Project"})
        _rehome_recurring_series(WORKER)
        kids = frappe.get_all("Project Todo", filters={"original_todo": s.name},
                              fields=["assigned_to"])
        self.assertEqual(len(kids), 1, "the routine must survive its owner leaving")
        self.assertEqual(kids[0].assigned_to, LEADER)
        self.assertEqual(
            frappe.db.get_value("Project Todo", s.name, "assigned_to"), WORKER,
            "history untouched",
        )

    def test_offboarding_leaves_a_paused_series_paused(self):
        from vernon_project.user_offboarding import _rehome_recurring_series
        s = self._series()
        frappe.db.set_value("Project Todo", s.name, "recurring_paused", 1)
        self._disable(WORKER)
        _rehome_recurring_series(WORKER)
        self.assertEqual(frappe.db.count("Project Todo", {"original_todo": s.name}), 0)
