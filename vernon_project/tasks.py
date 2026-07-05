# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from datetime import date

import frappe
from frappe.utils import add_days, nowdate


def create_recurring_todos():
    """Daily: roll each active recurring series forward by one step when due.

    Keys off the LATEST occurrence per series (COALESCE(original_todo,name)) rather than a
    migrating next_occurrence flag, so a deleted/cancelled occurrence cannot strand the series.
    generate_next() enforces paused/until/resume-clamp/dedup internally.
    """
    from vernon_project.vernon_project.doctype.project_todo.project_todo import (
        latest_occurrence, generate_next,
    )

    roots = frappe.db.sql(
        """
        SELECT DISTINCT COALESCE(NULLIF(original_todo,''), name) AS root
        FROM `tabProject Todo`
        WHERE is_recurring = 1 AND recurring_frequency IS NOT NULL AND recurring_frequency != ''
        """,
        as_dict=True,
    )

    created = 0
    for r in roots:
        try:
            anchor = latest_occurrence(r.root)
            if anchor and generate_next(anchor):  # scheduler path: force=False
                created += 1
                frappe.db.commit()
        except Exception as e:
            frappe.db.rollback()
            frappe.log_error(f"Error creating recurring todo: {e}", "Recurring Todo Error")

    if created:
        frappe.logger().info(f"Created {created} recurring todos")
    return created


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
          AND is_waiting = 0
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


def notify_comeback_nudge():
    """Daily: one warm nudge to people who have gone quiet.

    A user with open Planned work but zero completions in the last 7 days gets a
    single gentle Encouragement pointing at their smallest open task — an easy
    re-entry, not a guilt trip. Cadence: at most one Encouragement per user per
    7 days, and never on a day they were already deadline-nagged, so pressure
    never stacks.
    """
    from vernon_project.api.mobile import _notify

    today = nowdate()
    week_ago = add_days(today, -7)

    # Smallest-estimate open Planned todo per assignee (NULL/0 estimate sorts last).
    # ponytail: status LIKE '%Planned' dodges the emoji variation-selector, same as
    # notify_due_todos.
    rows = frappe.db.sql(
        """
        SELECT assigned_to, name, to_do, estimated
        FROM `tabProject Todo`
        WHERE status LIKE %(planned)s
          AND is_waiting = 0
          AND assigned_to IS NOT NULL AND assigned_to != ''
        ORDER BY assigned_to, (estimated IS NULL OR estimated = 0), estimated ASC, deadline ASC
        """,
        {"planned": "%Planned"},
        as_dict=True,
    )
    smallest = {}
    for r in rows:
        if r.assigned_to not in smallest:
            smallest[r.assigned_to] = r

    sent = 0
    for user, todo in smallest.items():
        # Completed anything in the last 7 days? Then they're active — no nudge.
        if frappe.db.count(
            "Project Todo",
            {"assigned_to": user, "status": ["like", "%Completed"], "completed_at": [">=", week_ago]},
        ):
            continue
        # Cadence: at most one Encouragement per user per 7 days.
        if frappe.db.exists(
            "Vernon Notification",
            {"recipient": user, "type": "Encouragement", "creation": [">=", week_ago]},
        ):
            continue
        # Don't stack on top of a deadline nag sent today.
        if frappe.db.exists(
            "Vernon Notification",
            {"recipient": user, "type": "Deadline", "creation": [">=", today]},
        ):
            continue
        label = (str(todo.to_do).strip() if todo.to_do else "") or "a small task"
        _notify(
            recipient=user,
            type="Encouragement",
            title="Ready when you are 💛",
            body=f'No rush — "{label}" is a small one to ease back in whenever you like.',
            reference_doctype="Project Todo",
            reference_name=todo.name,
        )
        sent += 1

    if sent:
        frappe.logger().info(f"Sent {sent} comeback nudges")
    return sent
