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


def create_recurring_meetings():
    """Daily: roll each active recurring meeting series forward by one step when due.

    Keys off the LATEST occurrence per series (COALESCE(original_meeting,name)), so a
    deleted/cancelled occurrence cannot strand the series. generate_next() enforces
    paused/until/resume-clamp/dedup internally.
    """
    from vernon_project.vernon_project.doctype.meeting.meeting import (
        latest_occurrence, generate_next,
    )

    roots = frappe.db.sql(
        """
        SELECT DISTINCT COALESCE(NULLIF(original_meeting,''), name) AS root
        FROM `tabMeeting`
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
            frappe.log_error(f"Error creating recurring meeting: {e}", "Recurring Meeting Error")

    if created:
        frappe.logger().info(f"Created {created} recurring meetings")
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


def notify_overdue_courses():
    """Daily: nudge users whose assigned courses are past due and not completed."""
    import frappe
    from frappe.utils import today
    from vernon_project.api.mobile import _notify

    rows = frappe.get_all(
        "Course Enrollment",
        filters={"assigned": 1, "status": ["!=", "Completed"], "due_date": ["<", today()]},
        fields=["user", "course", "due_date"],
    )
    for r in rows:
        title = frappe.db.get_value("Course", r.course, "title")
        _notify(
            r.user, "Learning", "Course overdue",
            f"Your assigned course “{title}” was due {r.due_date}.",
            "Course", r.course,
        )


def _stale_plan_cutoff(today_date, grace_days):
    """Latest allocation_date that still gets swept: slots with allocation_date <= cutoff are stale.

    grace_days=1 -> cutoff is yesterday. grace floored at 1 (not 0) so the cutoff is
    always <= yesterday: a slot due today isn't past-due, and today's / future plans are
    never deleted at the midnight sweep no matter what grace an admin sets.
    """
    from datetime import timedelta

    return today_date - timedelta(days=max(1, int(grace_days)))


def sweep_stale_plans():
    """Cron 00:00: drop past-due day-plan slots from still-Planned todos.

    Gated by Vernon Settings.sweep_stale_plans (default off). A slot is stale when its
    allocation_date <= today - sweep_stale_plan_after_days (grace, default 1). Only the
    assignee's `allocations` are touched (planning-only, not scored); Done/Checked/
    Completed todos and today's / future slots are left alone. One JOINed DELETE.
    """
    from frappe.utils import getdate
    from vernon_project.api.mobile import STATUS_PLANNED

    if not frappe.db.get_single_value("Vernon Settings", "sweep_stale_plans"):
        return 0
    grace = frappe.db.get_single_value("Vernon Settings", "sweep_stale_plan_after_days")
    cutoff = _stale_plan_cutoff(getdate(nowdate()), grace if grace is not None else 1)

    where = (
        "FROM `tabProject Todo Allocation` a "
        "JOIN `tabProject Todo` t ON t.name = a.parent "
        "WHERE t.status = %s AND a.allocation_date <= %s"
    )
    args = (STATUS_PLANNED, cutoff)
    count = frappe.db.sql(f"SELECT COUNT(*) {where}", args)[0][0]
    if count:
        frappe.db.sql(f"DELETE a {where}", args)
        frappe.db.commit()
    frappe.logger().info(f"sweep_stale_plans: removed {count} stale plan slots (allocation_date <= {cutoff})")
    return count


def notify_habit_checkins():
	"""Once/day: nudge users who have an active habit scheduled today but no
	check-in yet. Admin-gated by Vernon Settings.habit_reminders (default off).
	Dedup per-user-per-day on Vernon Notification (type Encouragement, ref Habit).
	"""
	if not frappe.db.get_single_value("Vernon Settings", "habit_reminders"):
		return 0
	from vernon_project.api.habit import _scheduled, _parse_weekdays
	from vernon_project.api.mobile import _notify

	today = frappe.utils.getdate(frappe.utils.today())
	today_iso = today.isoformat()
	habits = frappe.get_all(
		"Habit", filters={"active": 1},
		fields=["name", "user", "cadence", "weekdays"], limit_page_length=0,
	)
	# users with a habit scheduled today
	scheduled_users = {}
	for h in habits:
		if _scheduled(today, h.cadence, set(_parse_weekdays(h.weekdays))):
			scheduled_users.setdefault(h.user, []).append(h.name)
	if not scheduled_users:
		return 0
	# users who already logged ANY habit today
	logged = set(frappe.get_all(
		"Habit Log", filters={"date": today, "user": ["in", list(scheduled_users)]},
		pluck="user", limit_page_length=0,
	))
	sent = 0
	for user, names in scheduled_users.items():
		if user in logged:
			continue
		if frappe.db.exists("Vernon Notification", {
			"recipient": user, "type": "Encouragement",
			"reference_doctype": "Habit", "creation": [">=", today_iso],
		}):
			continue
		_notify(
			recipient=user, type="Encouragement",
			title="Kebiasaanmu menunggu 🌱",
			body="Belum ada centang hari ini. Yuk selesaikan satu kebiasaan.",
			reference_doctype="Habit", reference_name=names[0],
		)
		sent += 1
	return sent
