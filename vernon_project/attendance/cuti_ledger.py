# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Materialized leave (cuti) ledger. Remaining leave for a year = SUM(Cuti Ledger.days)
# over (employee, year). Every grant, approved cuti, cuti-bersama day and HR adjustment
# is one persisted SIGNED row — grants/adjustments +, cuti debits −. Nothing is added
# or subtracted at read: the sign is the whole story. This REPLACES the
# derive-from-exceptions math in leave_quota.py for the default-annual pool.
#
# Only the default-annual Leave Type (the annual quota "account") flows through here.
# Per-Event / Documented leave types keep their own per-request ceilings in
# leave_quota.check_request and never mint rows.
#
# The doctype controller is empty (append-only); all logic lives here, exactly like
# Point Ledger's callers.

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime, nowdate

from vernon_project.attendance.leave_quota import (
    default_annual_type,
    effective_quota,
    working_days,
    year_slices,
)

DOCTYPE = "Cuti Ledger"
ADJUSTMENT_TYPES = ("Carry-over", "Bonus", "Correction")


# ---------------------------------------------------------------- readers

def remaining(employee, year, exclude_exception=None):
    """Net leave days left for (employee, year) = SUM(days).

    `exclude_exception` drops that exception's own Cuti rows — used by the approval
    gate so re-validating an already-minted leave never counts itself out (an edit of
    an approved cuti would otherwise see its own debit and false-reject).
    """
    rows = frappe.get_all(
        DOCTYPE,
        filters={"employee": employee, "year": int(year)},
        fields=["days", "exception"],
    )
    return sum(
        (r.days or 0)
        for r in rows
        if not (exclude_exception and r.exception == exclude_exception)
    )


def balance_summary(employee, year):
    """{quota, used, remaining, cuti_bersama, prior} for the boot payload / statement
    header. Keys match the old _leave_balance so the frontends don't change shape.
    quota = sum of positive rows; used = magnitude of negative rows; remaining = net."""
    year = int(year)
    rows = frappe.get_all(
        DOCTYPE,
        filters={"employee": employee, "year": year},
        fields=["days", "entry_type"],
    )
    quota = sum((r.days or 0) for r in rows if (r.days or 0) > 0)
    used = -sum((r.days or 0) for r in rows if (r.days or 0) < 0)
    cuti_bersama = -sum((r.days or 0) for r in rows if r.entry_type == "Cuti Bersama")
    return {
        "quota": quota,
        "used": used,
        "remaining": quota - used,
        "cuti_bersama": cuti_bersama,
        # prior_leave_taken is folded into an opening Correction row at backfill, so it
        # is already inside `used`; the standalone key stays for frontend compatibility.
        "prior": 0,
    }


def statement(employee, year):
    """Ledger rows for (employee, year), oldest-first, each carrying a running balance.
    Opening entries (Grant / adjustments — no from_date) sort first, then cuti by date."""
    year = int(year)
    rows = frappe.get_all(
        DOCTYPE,
        filters={"employee": employee, "year": year},
        fields=[
            "name", "entry_type", "leave_type", "days", "from_date", "to_date",
            "exception", "reason", "posted_by", "posted_on", "creation",
        ],
        order_by="from_date asc, posted_on asc, creation asc",
    )
    bal = 0.0
    out = []
    for r in rows:
        bal += r.days or 0
        out.append({**r, "balance": bal})
    return out


# ---------------------------------------------------------------- grant

def ensure_grant(employee, year):
    """Idempotent upsert of the annual Grant row = effective_quota(employee). Keyed on
    (employee, year, entry_type='Grant'); re-running after a quota edit updates the row."""
    year = int(year)
    lt = default_annual_type()
    q = effective_quota(employee)
    existing = frappe.db.get_value(
        DOCTYPE, {"employee": employee, "year": year, "entry_type": "Grant"}, "name"
    )
    if existing:
        if (frappe.db.get_value(DOCTYPE, existing, "days") or 0) != q:
            doc = frappe.get_doc(DOCTYPE, existing)
            doc.days = q
            doc.leave_type = lt
            doc.posted_on = now_datetime()
            doc.save(ignore_permissions=True)
        return existing
    return frappe.get_doc({
        "doctype": DOCTYPE, "employee": employee, "entry_type": "Grant",
        "leave_type": lt, "days": q, "year": year, "reason": "Kuota tahunan",
        "posted_by": frappe.session.user or "Administrator", "posted_on": now_datetime(),
    }).insert(ignore_permissions=True).name


def _employees():
    """Everyone who holds an Employee Profile — the population that gets a leave quota."""
    return frappe.get_all("Employee Profile", pluck="user")


def grant_annual_cuti():
    """Scheduler entrypoint (Jan 1 cron): mint this year's Grant row for every employee."""
    year = getdate(nowdate()).year
    for emp in _employees():
        if emp:
            ensure_grant(emp, year)
    frappe.db.commit()


def grant_on_profile_create(doc, method=None):
    """after_insert on Employee Profile: a new hire gets the current-year Grant at once
    (the yearly cron only runs Jan 1)."""
    if doc.user:
        ensure_grant(doc.user, getdate(nowdate()).year)


# ---------------------------------------------------------------- cuti debits

def sync_cuti(exception):
    """Bring an Attendance Exception's Cuti debit rows in line with its current state.
    Idempotent and self-healing — called from the on_update trigger, so it covers
    approve, reject, cancel, and date edits in one place. A cross-year cuti mints one
    row per year slice (each year's quota is separate)."""
    exc = exception if hasattr(exception, "name") else frappe.get_doc(
        "Attendance Exception", exception
    )
    is_pool_debit = (
        exc.status == "Approved"
        and exc.exception_type == "Leave"
        and exc.leave_type
        and exc.leave_type == default_annual_type()
    )
    existing = {
        r.year: r.name
        for r in frappe.get_all(
            DOCTYPE, filters={"exception": exc.name}, fields=["name", "year"]
        )
    }
    if not is_pool_debit:
        # not (or no longer) a pooled leave: drop any rows it once had
        for name in existing.values():
            frappe.delete_doc(DOCTYPE, name, ignore_permissions=True, force=True)
        return

    desired = {}
    for (year, start, end) in year_slices(exc.from_date, exc.to_date):
        wd = working_days(exc.employee, start, end)
        if wd > 0:
            desired[year] = (wd, start, end)

    posted_by = exc.hr_by or exc.approver or "Administrator"
    for year, (wd, start, end) in desired.items():
        if year in existing:
            doc = frappe.get_doc(DOCTYPE, existing[year])
            if (
                doc.days != -wd
                or str(doc.from_date) != str(start)
                or str(doc.to_date) != str(end)
                or doc.employee != exc.employee
            ):
                doc.employee = exc.employee
                doc.leave_type = exc.leave_type
                doc.days = -wd
                doc.from_date, doc.to_date = start, end
                doc.reason = exc.reason
                doc.posted_on = now_datetime()
                doc.save(ignore_permissions=True)
        else:
            frappe.get_doc({
                "doctype": DOCTYPE, "employee": exc.employee, "entry_type": "Cuti",
                "leave_type": exc.leave_type, "days": -wd, "year": year,
                "from_date": start, "to_date": end, "exception": exc.name,
                "reason": exc.reason, "posted_by": posted_by, "posted_on": now_datetime(),
            }).insert(ignore_permissions=True)

    # drop rows for years the cuti no longer covers (dates shrank / employee changed)
    for year, name in existing.items():
        if year not in desired:
            frappe.delete_doc(DOCTYPE, name, ignore_permissions=True, force=True)


def remove_cuti(exception_name):
    """Delete every Cuti row for an exception (only Cuti rows carry an exception link)."""
    for r in frappe.get_all(DOCTYPE, filters={"exception": exception_name}, fields=["name"]):
        frappe.delete_doc(DOCTYPE, r.name, ignore_permissions=True, force=True)


# ---------------------------------------------------------------- cuti bersama

def remint_cuti_bersama_for_list(holiday_list):
    """Re-mint per-employee Cuti Bersama debit rows for every employee whose brand uses
    this holiday list. Wipe-and-rebuild (brand → one list, so a brand's employees draw
    cuti bersama only from this list): delete their Cuti Bersama rows, recreate from the
    list's current is_cuti_bersama days on which each employee is shift-assigned.

    # ponytail: O(employees × cuti-bersama-days), synchronous in the list save. Fine at
    # org scale; push to frappe.enqueue keyed on the list if it ever grows.
    """
    from vernon_project.attendance.engine import _assignment_for

    brands = frappe.get_all("Brand", filters={"holiday_list": holiday_list}, pluck="name")
    if not brands:
        return
    employees = frappe.get_all(
        "Attendance Profile", filters={"brand": ["in", brands], "active": 1}, pluck="user"
    )
    cb_days = frappe.get_all(
        "Attendance Holiday",
        filters={
            "parent": holiday_list, "parenttype": "Attendance Holiday List",
            "is_cuti_bersama": 1,
        },
        pluck="holiday_date",
    )
    lt = default_annual_type()
    for emp in employees:
        for r in frappe.get_all(
            DOCTYPE, filters={"employee": emp, "entry_type": "Cuti Bersama"}, fields=["name"]
        ):
            frappe.delete_doc(DOCTYPE, r.name, ignore_permissions=True, force=True)
        for hd in cb_days:
            d = getdate(hd)
            if _assignment_for(emp, d):
                frappe.get_doc({
                    "doctype": DOCTYPE, "employee": emp, "entry_type": "Cuti Bersama",
                    "leave_type": lt, "days": -1, "year": d.year, "from_date": d,
                    "to_date": d, "reason": "Cuti bersama", "posted_by": "Administrator",
                    "posted_on": now_datetime(),
                }).insert(ignore_permissions=True)


# ---------------------------------------------------------------- HR adjustments

def post_adjustment(employee, entry_type, days, year, reason, posted_by=None):
    """HR posts a manual Carry-over / Bonus / Correction row. Carry-over/Bonus must be
    positive; Correction may be signed. Reason required."""
    if entry_type not in ADJUSTMENT_TYPES:
        frappe.throw(_("Jenis penyesuaian tidak valid."))
    days = float(days)
    if entry_type in ("Carry-over", "Bonus") and days <= 0:
        frappe.throw(_("{0} harus bernilai positif.").format(entry_type))
    if days == 0:
        frappe.throw(_("Jumlah hari tidak boleh nol."))
    if not (reason or "").strip():
        frappe.throw(_("Alasan wajib diisi."))
    return frappe.get_doc({
        "doctype": DOCTYPE, "employee": employee, "entry_type": entry_type,
        "leave_type": default_annual_type(), "days": days, "year": int(year),
        "reason": reason.strip(), "posted_by": posted_by or frappe.session.user,
        "posted_on": now_datetime(),
    }).insert(ignore_permissions=True)
