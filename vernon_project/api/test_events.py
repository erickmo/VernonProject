# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import hashlib
import unittest
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import now_datetime

from vernon_project.api.events import _apply_notification, register
from vernon_project.api.midtrans import verify_signature
from vernon_project.api.mobile import _user_balance

# ponytail: single class, setUp/tearDown explicit cleanup; no fixtures/factories.

_TEST_KEY = "test-server-key-abc123"


def _sha512_sig(order_id, status_code, gross_amount, server_key=_TEST_KEY):
    raw = str(order_id) + str(status_code) + str(gross_amount) + server_key
    return hashlib.sha512(raw.encode()).hexdigest()


class TestEventsRegistration(FrappeTestCase):

    def setUp(self):
        self._created = []  # list of (doctype, name) to delete in tearDown

    def tearDown(self):
        frappe.set_user("Administrator")
        for dt, name in reversed(self._created):
            try:
                frappe.delete_doc(dt, name, force=True, ignore_permissions=True, delete_permanently=True)
            except Exception:
                pass
        frappe.db.commit()

    # ------------------------------------------------------------------ helpers

    def _event(self, **kw):
        d = {
            "doctype": "Vernon Event",
            "title": kw.pop("title", "Test Event"),
            "start_datetime": now_datetime(),
            "status": "Published",
            "pricing": "Free",
        }
        d.update(kw)
        doc = frappe.get_doc(d)
        doc.insert(ignore_permissions=True, ignore_links=True)
        self._created.append(("Vernon Event", doc.name))
        return doc

    def _reg(self, event, user, status="Confirmed", method="Free", amount=0):
        """Insert a registration row directly (for setup, bypassing register())."""
        doc = frappe.get_doc({
            "doctype": "Vernon Event Registration",
            "event": event,
            "user": user,
            "status": status,
            "method": method,
            "amount": amount,
            "registered_on": now_datetime(),
        })
        doc.insert(ignore_permissions=True, ignore_links=True)
        self._created.append(("Vernon Event Registration", doc.name))
        return doc

    def _grant_points(self, user, points):
        doc = frappe.get_doc({
            "doctype": "Point Ledger",
            "user": user,
            "points_earned": points,
            "source": "Other",
        })
        doc.insert(ignore_permissions=True, ignore_links=True)
        self._created.append(("Point Ledger", doc.name))
        return doc

    # ------------------------------------------------------------------ tests

    def test_points_registration_debits_balance(self):
        user = "Administrator"
        frappe.set_user(user)

        # Snapshot balance BEFORE test data so the assertion is data-independent.
        _, _, bal_before = _user_balance(user)

        self._grant_points(user, 100)
        ev = self._event(pricing="Points", points_cost=30)

        result = register(ev.name)
        self._created.append(("Vernon Event Registration", result["registration"]))

        _, _, bal_after = _user_balance(user)
        self.assertAlmostEqual(bal_after, bal_before + 100 - 30, places=4)

        # Duplicate register raises "already registered".
        with self.assertRaises(frappe.ValidationError):
            register(ev.name)

    def test_capacity_enforced(self):
        user = "Administrator"
        frappe.set_user(user)

        ev = self._event(pricing="Free", capacity=1)

        # Pre-fill the one seat with a dummy user.
        # ponytail: ignore_links=True because "seat-holder@cap.test" need not be a real User.
        self._reg(ev.name, "seat-holder@cap.test", status="Confirmed", method="Free")

        # Now Administrator tries to register → event is full.
        with self.assertRaises(frappe.ValidationError):
            register(ev.name)

    def test_insufficient_points_rejected(self):
        user = "Administrator"
        frappe.set_user(user)

        # Grant 10 points but event costs 999 → should be refused.
        self._grant_points(user, 10)
        # Snapshot balance first so cost > balance regardless of existing records.
        _, _, bal = _user_balance(user)
        cost = bal + 500  # always exceeds current balance

        ev = self._event(pricing="Points", points_cost=cost)

        with self.assertRaises(frappe.ValidationError) as cm:
            register(ev.name)

        self.assertIn("Insufficient", str(cm.exception))

        # No registration row created.
        count = frappe.db.count(
            "Vernon Event Registration",
            {"event": ev.name, "user": user},
        )
        self.assertEqual(count, 0)

    def test_webhook_signature_and_idempotency(self):
        user = "Administrator"
        ev = self._event(pricing="Rupiah", price=50000)
        reg = self._reg(ev.name, user, status="Pending", method="Rupiah", amount=50000)
        # Set midtrans_order_id so _apply_notification can find the row.
        reg.db_set("midtrans_order_id", reg.name)

        def _make_payload(status_code="200", gross_amount="50000.00",
                          txn_status="settlement", fraud=None, sig=None):
            p = {
                "order_id": reg.name,
                "status_code": status_code,
                "gross_amount": gross_amount,
                "transaction_status": txn_status,
            }
            if fraud:
                p["fraud_status"] = fraud
            p["signature_key"] = sig or _sha512_sig(reg.name, status_code, gross_amount)
            return p

        with patch("vernon_project.api.events._server_key", return_value=_TEST_KEY):
            # Bad signature must raise PermissionError.
            bad = _make_payload(sig="badsig")
            with self.assertRaises(frappe.PermissionError):
                _apply_notification(bad)

            # Valid settlement flips Pending → Confirmed.
            result = _apply_notification(_make_payload())
            self.assertEqual(result, "Confirmed")
            self.assertEqual(
                frappe.db.get_value("Vernon Event Registration", reg.name, "status"),
                "Confirmed",
            )

            # Replay is idempotent (already Confirmed → no-op).
            result2 = _apply_notification(_make_payload())
            self.assertEqual(result2, "Confirmed")

            # Amount mismatch raises PermissionError.
            tampered = _make_payload(gross_amount="99999.00",
                                     sig=_sha512_sig(reg.name, "200", "99999.00"))
            with self.assertRaises(frappe.PermissionError):
                _apply_notification(tampered)


if __name__ == "__main__":
    unittest.main()
