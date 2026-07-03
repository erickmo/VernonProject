# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import now_datetime

from vernon_project.api.events_admin import (
    cancel_registration, delete_event, event_roster, mark_attended, save_event,
)
from vernon_project.api.events import _active_count
from vernon_project.api.mobile import _user_balance

# Stable test-user emails (created once, never deleted between tests)
_USER_A = "test_evadmin_a@example.com"
_USER_B = "test_evadmin_b@example.com"


def _ensure_user(email, first_name):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email,
            "first_name": first_name, "send_welcome_email": 0,
        }).insert(ignore_permissions=True)


def _make_event(organizer, pricing="Free", points_cost=0, status="Published"):
    return frappe.get_doc({
        "doctype": "Vernon Event",
        "title": "Evadmin Test Event",
        "organizer": organizer,
        "status": status,
        "pricing": pricing,
        "points_cost": points_cost,
        "start_datetime": now_datetime(),
    }).insert(ignore_permissions=True)


def _make_reg(event, user, method="Points", amount=50, status="Confirmed"):
    return frappe.get_doc({
        "doctype": "Vernon Event Registration",
        "event": event,
        "user": user,
        "method": method,
        "amount": amount,
        "status": status,
        "registered_on": now_datetime(),
    }).insert(ignore_permissions=True)


def _grant_points(user, amount):
    """Insert a Point Ledger row; 'Grant' is a valid source Select option."""
    return frappe.get_doc({
        "doctype": "Point Ledger",
        "user": user,
        "points_earned": amount,
        "source": "Grant",
        "credited_on": now_datetime(),
    }).insert(ignore_permissions=True)


class TestEventsAdmin(FrappeTestCase):

    def setUp(self):
        frappe.set_user("Administrator")
        _ensure_user(_USER_A, "Events A")
        _ensure_user(_USER_B, "Events B")
        # (doctype, name) pairs in creation order; tearDown deletes in reverse
        self._created = []

    def tearDown(self):
        frappe.set_user("Administrator")
        for dt, name in reversed(self._created):
            if frappe.db.exists(dt, name):
                frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
        frappe.db.commit()

    def _track(self, doc):
        """Register a doc for cleanup and return it."""
        self._created.append((doc.doctype, doc.name))
        return doc

    # ------------------------------------------------------------------ #
    # 1. _can_manage gate
    # ------------------------------------------------------------------ #

    def test_can_manage_gate(self):
        ev = self._track(_make_event(_USER_A))
        eid = ev.name

        # USER_B (non-SM, non-organizer) must be denied on all three endpoints
        frappe.set_user(_USER_B)
        with self.assertRaises(frappe.PermissionError):
            event_roster(eid)
        with self.assertRaises(frappe.PermissionError):
            save_event({"title": "Hijack"}, name=eid)
        with self.assertRaises(frappe.PermissionError):
            delete_event(eid)

        # USER_A (organizer) must be permitted — use non-destructive calls
        frappe.set_user(_USER_A)
        rows = event_roster(eid)
        self.assertIsInstance(rows, list)
        result = save_event({"title": "Updated by A"}, name=eid)
        self.assertEqual(result["name"], eid)

        # Administrator (System Manager) must be permitted; delete_event proves it
        frappe.set_user("Administrator")
        rows = event_roster(eid)
        self.assertIsInstance(rows, list)
        delete_event(eid)
        # Remove from cleanup list — already gone
        self._created.remove(("Vernon Event", eid))

    # ------------------------------------------------------------------ #
    # 2. save_event stamps organizer; ignores organizer in payload
    # ------------------------------------------------------------------ #

    def test_save_event_stamps_organizer(self):
        frappe.set_user(_USER_A)

        # No-name create: organizer must be set to the session user
        result = save_event({
            "title": "New by A",
            "start_datetime": str(now_datetime()),
            "status": "Draft",
            "pricing": "Free",
        })
        name = result["name"]
        self._created.append(("Vernon Event", name))
        self.assertEqual(
            frappe.db.get_value("Vernon Event", name, "organizer"),
            _USER_A,
        )

        # Repeat with organizer in payload: it must still be SESSION user, not payload value
        result2 = save_event({
            "title": "Attempt override",
            "start_datetime": str(now_datetime()),
            "status": "Draft",
            "pricing": "Free",
            "organizer": _USER_B,  # should be ignored
        })
        name2 = result2["name"]
        self._created.append(("Vernon Event", name2))
        self.assertEqual(
            frappe.db.get_value("Vernon Event", name2, "organizer"),
            _USER_A,  # payload value was ignored
        )

    # ------------------------------------------------------------------ #
    # 3. cancel_registration refunds points and frees seat
    # ------------------------------------------------------------------ #

    def test_cancel_registration_refunds_points_and_frees_seat(self):
        ev = self._track(_make_event(_USER_A, pricing="Points", points_cost=50))
        pl = self._track(_grant_points(_USER_B, 200))
        # Confirmed Points registration (holds a seat and costs balance)
        reg = self._track(_make_reg(ev.name, _USER_B, method="Points", amount=50, status="Confirmed"))

        _, _, balance_before = _user_balance(_USER_B)
        count_before = _active_count(ev.name)

        # Organizer cancels the registration
        frappe.set_user(_USER_A)
        cancel_registration(reg.name)

        status = frappe.db.get_value("Vernon Event Registration", reg.name, "status")
        _, _, balance_after = _user_balance(_USER_B)
        count_after = _active_count(ev.name)

        self.assertEqual(status, "Cancelled")
        self.assertAlmostEqual(balance_after, balance_before + 50)
        self.assertEqual(count_after, count_before - 1)

    # ------------------------------------------------------------------ #
    # 4. mark_attended toggles 0 → 1 → 0
    # ------------------------------------------------------------------ #

    def test_mark_attended(self):
        ev = self._track(_make_event(_USER_A))
        reg = self._track(_make_reg(ev.name, _USER_B, method="Free", amount=0, status="Confirmed"))

        frappe.set_user(_USER_A)

        mark_attended(reg.name, 1)
        self.assertEqual(
            frappe.db.get_value("Vernon Event Registration", reg.name, "attended"), 1
        )

        mark_attended(reg.name, 0)
        self.assertEqual(
            frappe.db.get_value("Vernon Event Registration", reg.name, "attended"), 0
        )
