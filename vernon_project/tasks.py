# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from datetime import date

import frappe
from frappe.utils import add_days, getdate, nowdate


def create_recurring_todos():
    """Daily: roll recurring Project Todos forward (standalone doctype).

    When a recurring todo's `next_occurrence` has arrived, create the next
    occurrence regardless of the current one's status, then clear the head's
    next_occurrence so it processes exactly once.
    """
    today = nowdate()

    heads = frappe.db.sql(
        """
        SELECT name, project_detail, to_do, assigned_to, start_date, deadline, estimated,
               notes, `group`, level, level_id, recurring_frequency, recurring_until,
               next_occurrence, original_todo, status
        FROM `tabProject Todo`
        WHERE is_recurring = 1
          AND recurring_frequency IS NOT NULL
          AND recurring_frequency != ''
          AND next_occurrence IS NOT NULL
          AND next_occurrence <= %s
        """,
        (today,),
        as_dict=True,
    )

    created_count = 0

    for h in heads:
        try:
            next_date = h.next_occurrence

            if h.recurring_until and getdate(next_date) > getdate(h.recurring_until):
                frappe.db.set_value("Project Todo", h.name, "next_occurrence", None, update_modified=False)
                continue

            exists = frappe.db.exists("Project Todo", {
                "project_detail": h.project_detail,
                "to_do": h.to_do,
                "deadline": next_date,
                "assigned_to": h.assigned_to,
            })

            if not exists:
                head_doc = frappe.get_doc("Project Todo", h.name)
                following = head_doc.calculate_next_occurrence(next_date)
                frappe.get_doc({
                    "doctype": "Project Todo",
                    "project_detail": h.project_detail,
                    "to_do": h.to_do,
                    "assigned_to": h.assigned_to,
                    # Shift the start date forward by the same gap, keeping start→deadline span.
                    "start_date": (
                        add_days(getdate(h.start_date), (getdate(next_date) - getdate(h.deadline)).days)
                        if h.start_date and h.deadline
                        else next_date
                    ),
                    "deadline": next_date,
                    "estimated": h.estimated,
                    "notes": h.notes,
                    # group/level are required on Project Todo; mirror create_next_occurrence.
                    "group": h.group,
                    "level": h.level,
                    "level_id": h.level_id,
                    "is_recurring": 1,
                    "recurring_frequency": h.recurring_frequency,
                    "recurring_until": h.recurring_until,
                    "next_occurrence": following,
                    "original_todo": h.original_todo or h.name,
                    "status": "⚪️ Planned",
                }).insert(ignore_permissions=True)
                created_count += 1

            frappe.db.set_value("Project Todo", h.name, "next_occurrence", None, update_modified=False)

        except Exception as e:
            frappe.log_error(f"Error creating recurring todo: {str(e)}", "Recurring Todo Error")
            continue

    if created_count > 0:
        frappe.db.commit()
        frappe.logger().info(f"Created {created_count} recurring todos")

    return created_count


def _due_message(to_do, deadline, today):
    """Pure (no DB): the (title, body) for a due/overdue Planned todo, or None
    when the deadline is still in the future. `deadline`/`today` accept a date or
    an ISO 'YYYY-MM-DD' string. Kept frappe-free so the date logic is unit-testable
    without a site (see test_tasks.py)."""
    if not deadline:
        return None
    d = deadline if isinstance(deadline, date) else date.fromisoformat(str(deadline)[:10])
    t = today if isinstance(today, date) else date.fromisoformat(str(today)[:10])
    if d > t:
        return None
    label = (str(to_do).strip() if to_do else "") or "Your task"
    if d < t:
        return ("Task overdue", f'"{label}" was due {d.strftime("%-d %b %Y")}.')
    return ("Task due today", f'"{label}" is due today.')


def notify_due_todos():
    """Daily: nudge assignees about Planned todos due today or overdue.

    Mirrors the Today dashboard's overdue/due_today buckets (assigned, still
    Planned) and reuses _notify (in-app Vernon Notification + Web Push). Idempotent
    per calendar day: a todo already nudged today is skipped, so a manual re-run or
    a second scheduler tick never double-sends.
    """
    from vernon_project.api.mobile import _notify

    today = nowdate()
    # ponytail: status LIKE '%Planned' sidesteps the emoji/variation-selector in
    # the canonical '⚪️ Planned' value; no other status ends in "Planned".
    rows = frappe.db.sql(
        """
        SELECT name, to_do, assigned_to, deadline
        FROM `tabProject Todo`
        WHERE status LIKE %(planned)s
          AND assigned_to IS NOT NULL AND assigned_to != ''
          AND deadline IS NOT NULL
          AND deadline <= %(today)s
        """,
        {"planned": "%Planned", "today": today},
        as_dict=True,
    )

    sent = 0
    for r in rows:
        msg = _due_message(r.to_do, r.deadline, today)
        if not msg:
            continue
        # Idempotent: at most one deadline nudge per todo per calendar day.
        if frappe.db.exists(
            "Vernon Notification",
            {
                "recipient": r.assigned_to,
                "reference_doctype": "Project Todo",
                "reference_name": r.name,
                "type": "Deadline",
                "creation": [">=", today],
            },
        ):
            continue
        title, body = msg
        _notify(
            recipient=r.assigned_to,
            type="Deadline",
            title=title,
            body=body,
            reference_doctype="Project Todo",
            reference_name=r.name,
        )
        sent += 1

    if sent:
        frappe.logger().info(f"Sent {sent} deadline notifications")
    return sent
