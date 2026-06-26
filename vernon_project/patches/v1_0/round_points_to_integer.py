import frappe


def execute():
    """Points are now always whole numbers. Re-round existing stored values.

    Idempotent: ROUND of an already-integer value is a no-op.
    """
    frappe.db.sql(
        "UPDATE `tabProject Todo` SET "
        "point = ROUND(point), "
        "assignee_earned = ROUND(assignee_earned), "
        "leader_earned = ROUND(leader_earned)"
    )
    frappe.db.sql(
        "UPDATE `tabPoint Ledger` SET "
        "point = ROUND(point), "
        "points_earned = ROUND(points_earned)"
    )
