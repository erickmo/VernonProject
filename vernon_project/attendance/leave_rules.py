"""Leave-quota rules: lateness/early-leave penalties and overtime bonuses.

Pure math (``days_owed`` / ``reconcile_delta``) is frappe-free so it self-checks
under plain ``python3``. DB-touching helpers import frappe lazily.

Every number comes from Vernon Settings (with per-Brand override); nothing here
hard-codes a threshold or a day-unit.
"""

SETTING_FIELDS = [
    "late_penalty_enabled",
    "count_early_leave_in_penalty",
    "lateness_deduction_threshold_minutes",
    "overtime_bonus_enabled",
    "overtime_bonus_threshold_minutes",
]

_BOOL_FIELDS = {"late_penalty_enabled", "count_early_leave_in_penalty", "overtime_bonus_enabled"}


# --- pure math (no frappe) --------------------------------------------------

def days_owed(accrued_minutes, threshold):
    """Whole leave days represented by accrued minutes. threshold<=0 disables."""
    threshold = int(threshold or 0)
    if threshold <= 0:
        return 0
    return int(accrued_minutes or 0) // threshold


def reconcile_delta(existing_count, target_count):
    """How many rows to add (+) or remove (-) to reach the target count."""
    return int(target_count) - int(existing_count)


# --- settings resolution (Brand override else global) -----------------------

def resolve(employee):
    """Resolved leave-rule settings for a user: Brand override else global."""
    import frappe
    from vernon_project.attendance.leave_quota import _brand_for

    out = {}
    for f in SETTING_FIELDS:
        v = frappe.db.get_single_value("Vernon Settings", f)
        out[f] = bool(v) if f in _BOOL_FIELDS else int(v or 0)

    brand = _brand_for(employee)
    if brand and frappe.db.get_value("Brand", brand, "override_leave_rules"):
        for f in SETTING_FIELDS:
            v = frappe.db.get_value("Brand", brand, f)
            out[f] = bool(v) if f in _BOOL_FIELDS else int(v or 0)
    return out


# --- accrual sources --------------------------------------------------------

def accrued_penalty_minutes(employee, year, count_early):
    """Sum of late (+ optionally early-leave) minutes over the year's attendance."""
    import frappe
    rows = frappe.get_all(
        "Daily Attendance",
        filters={"employee": employee,
                 "attendance_date": ["between", [f"{year}-01-01", f"{year}-12-31"]]},
        fields=["late_minutes", "early_minutes"],
    )
    total = 0
    for r in rows:
        total += int(r.late_minutes or 0)
        if count_early:
            total += int(r.early_minutes or 0)
    return total


def _approved_overtime_minutes(employee, year):
    import frappe
    rows = frappe.get_all(
        "Overtime Entry",
        filters={"employee": employee, "status": "Approved",
                 "date": ["between", [f"{year}-01-01", f"{year}-12-31"]]},
        fields=["minutes"],
    )
    return sum(int(r.minutes or 0) for r in rows)


# --- reconcile (idempotent floor-count) -------------------------------------

def reconcile_penalty(employee, year):
    """Force Late-Penalty ledger rows to (accrued // threshold). Toggle off => 0."""
    from vernon_project.attendance import cuti_ledger
    s = resolve(employee)
    if not s["late_penalty_enabled"]:
        target = 0
    else:
        accrued = accrued_penalty_minutes(employee, year, s["count_early_leave_in_penalty"])
        target = days_owed(accrued, s["lateness_deduction_threshold_minutes"])
    return cuti_ledger.reconcile_signed(employee, year, "Late Penalty", -1, target,
                                        "Auto: lateness/early-leave accrual")


def reconcile_overtime(employee, year):
    """Force Overtime-Bonus ledger rows to (approved // threshold). Toggle off => 0."""
    from vernon_project.attendance import cuti_ledger
    s = resolve(employee)
    if not s["overtime_bonus_enabled"]:
        target = 0
    else:
        accrued = _approved_overtime_minutes(employee, year)
        target = days_owed(accrued, s["overtime_bonus_threshold_minutes"])
    return cuti_ledger.reconcile_signed(employee, year, "Overtime Bonus", 1, target,
                                        "Auto: approved overtime accrual")


def accrual_status(employee, year):
    """Progress figures for the UI (accrued vs threshold, per side)."""
    s = resolve(employee)
    return {
        "late_enabled": s["late_penalty_enabled"],
        "late_threshold": s["lateness_deduction_threshold_minutes"],
        "late_accrued": accrued_penalty_minutes(employee, year, s["count_early_leave_in_penalty"]),
        "overtime_enabled": s["overtime_bonus_enabled"],
        "overtime_threshold": s["overtime_bonus_threshold_minutes"],
        "overtime_accrued": _approved_overtime_minutes(employee, year),
    }


if __name__ == "__main__":
    assert days_owed(0, 480) == 0
    assert days_owed(479, 480) == 0
    assert days_owed(480, 480) == 1
    assert days_owed(961, 480) == 2
    assert days_owed(100, 0) == 0          # threshold 0 never divides
    assert reconcile_delta(0, 2) == 2      # insert 2
    assert reconcile_delta(3, 1) == -2     # delete 2 (toggle shrank target)
    assert reconcile_delta(2, 2) == 0
    print("leave_rules self-check OK")
