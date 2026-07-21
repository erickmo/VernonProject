import frappe
from frappe.utils import getdate, nowdate

from vernon_project.attendance import cuti_ledger as cl
from vernon_project.attendance.leave_quota import (
    cuti_bersama_days,
    default_annual_type,
    effective_quota,
    working_days,
    year_slices,
)

OPENING = "opening prior_leave_taken"


def execute():
    """Backfill the materialized Cuti Ledger from existing leave data. Idempotent: every
    mint is an upsert keyed on its source (grant per employee/year, cuti keyed on the
    exception, cuti-bersama wiped-and-rebuilt, opening prior keyed on its reason), so a
    re-run changes nothing.

    Order: (1) annual Grant per employee/year, (2) opening prior_leave_taken as a
    Correction debit for the current year, (3) Cuti debits from approved default-annual
    exceptions (via the same idempotent sync the runtime uses), (4) cuti-bersama rows.
    Then log any drift between the new ledger balance and the old *approved-only* derived
    balance — pending leave is intentionally no longer reserved, so it is excluded from
    the check to isolate genuine backfill bugs (missed row / wrong sign) from that change.
    """
    cur = getdate(nowdate()).year
    default_lt = default_annual_type()

    employees = frappe.get_all(
        "Employee Profile", fields=["user", "prior_leave_taken"]
    )
    employees = [e for e in employees if e.user]

    approved = (
        frappe.get_all(
            "Attendance Exception",
            filters={
                "exception_type": "Leave", "status": "Approved", "leave_type": default_lt,
            },
            fields=["name", "employee", "from_date", "to_date"],
        )
        if default_lt
        else []
    )

    # years touched by leave history, so a cross-year cuti has a grant in each of its years
    years_by_emp = {}
    for e in approved:
        for y in range(getdate(e.from_date).year, getdate(e.to_date).year + 1):
            years_by_emp.setdefault(e.employee, set()).add(y)

    # (1) Grant per employee/year
    for ep in employees:
        for y in {cur} | years_by_emp.get(ep.user, set()):
            cl.ensure_grant(ep.user, y)

    # (2) opening prior_leave_taken -> Correction debit for the current year
    for ep in employees:
        if not ep.prior_leave_taken:
            continue
        if frappe.db.exists(
            "Cuti Ledger",
            {"employee": ep.user, "year": cur, "entry_type": "Correction", "reason": OPENING},
        ):
            continue
        frappe.get_doc({
            "doctype": "Cuti Ledger", "employee": ep.user, "entry_type": "Correction",
            "leave_type": default_lt, "days": -int(ep.prior_leave_taken), "year": cur,
            "reason": OPENING, "posted_by": "Administrator",
        }).insert(ignore_permissions=True)

    # (3) Cuti debits from approved default-annual exceptions (keyed on the exception)
    for e in approved:
        cl.sync_cuti(e.name)

    # (4) cuti-bersama rows per holiday list that carries collective-leave days
    for hl in frappe.get_all("Attendance Holiday List", pluck="name"):
        cl.remint_cuti_bersama_for_list(hl)

    frappe.db.commit()

    _drift_check(employees, approved, cur)


def _approved_used(emp, approved, year):
    total = 0
    for e in approved:
        if e.employee != emp:
            continue
        for (y, s, en) in year_slices(e.from_date, e.to_date):
            if y == year:
                total += working_days(emp, s, en)
    return total


def _drift_check(employees, approved, year):
    drift = []
    for ep in employees:
        old = effective_quota(ep.user) - (
            _approved_used(ep.user, approved, year)
            + cuti_bersama_days(ep.user, year)
            + int(ep.prior_leave_taken or 0)
        )
        new = cl.remaining(ep.user, year)
        if round(old, 3) != round(new, 3):
            drift.append(f"{ep.user}: old={old} new={new}")
    if drift:
        frappe.log_error(
            title="Cuti Ledger backfill drift", message="\n".join(drift)
        )
        print(f"[cuti_ledger backfill] DRIFT on {len(drift)} employees — see Error Log")
    else:
        print(f"[cuti_ledger backfill] OK — {len(employees)} employees, balances match")
