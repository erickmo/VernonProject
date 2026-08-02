# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

"""Offboard a user when their account is disabled (enabled 1->0).

Wired as a User `on_update` doc_event, so it fires for every disable path:
Frappe desk, the mobile `update_user()` endpoint, and the bench console. All
work runs inside the disabling save's transaction, so a `throw` (an
unreplaceable required lead) rolls the whole disable back atomically.
"""

import frappe
from frappe import _
from frappe.utils import cint

from vernon_project.offboarding_plan import plan_lead_reassignments

# Project Todo statuses that mean "finished" — these stay with the disabled user
# as a historical record and are never reassigned. Mirrors project_todo.py.
TERMINAL_STATUSES = ("✅ Completed", "🚫 Cancelled")

# Mirrors mobile.MEETING_SCHEDULED (kept local to avoid importing the heavy api module).
MEETING_SCHEDULED = "⚪️ Scheduled"


def offboard_disabled_user(doc, method=None):
    """On the enabled 1->0 transition, remove the user from everything."""
    if not (doc.has_value_changed("enabled") and not cint(doc.enabled)):
        return
    offboard_user(doc.name)


def offboard_user(user):
    """Core offboarding. Reused by the disable hook and the one-time backfill.

    Phase 1 plans lead reassignments and throws if any required lead can't be
    replaced (nothing written). Phase 2 applies via raw db writes.
    """
    # ---- Phase 1: plan & block -------------------------------------------
    lead_projects = frappe.get_all(
        "Project",
        or_filters={"project_owner": user, "project_leader": user},
        fields=["name", "project_owner", "project_leader"],
    )
    candidates = set()
    for p in lead_projects:
        candidates.update((p.project_owner, p.project_leader))
    candidates.discard(user)
    candidates.discard(None)
    enabled_users = set(
        frappe.get_all("User", filters={"name": ["in", list(candidates)], "enabled": 1}, pluck="name")
    ) if candidates else set()

    plan, blockers = plan_lead_reassignments(lead_projects, user, enabled_users)
    if blockers:
        frappe.throw(
            _("Cannot disable {0}: reassign the owner/leader on these projects first: {1}.")
            .format(user, ", ".join(blockers)),
            title=_("Reassign project leads first"),
        )

    # ---- Phase 2: apply ---------------------------------------------------
    _transfer_open_todos(user)

    for item in plan:
        frappe.db.set_value("Project", item["project"], item["field"], item["new_value"])
        _ensure_role(item["new_value"], item["grant_role"])

    # A disabled user belongs on no team and no admin list, anywhere.
    frappe.db.delete("Project Team", {"user": user, "parenttype": "Project"})
    frappe.db.delete("Project Admin User", {"user": user, "parenttype": "Project"})

    _scrub_upcoming_meetings(user)


def _ensure_role(user, role):
    """Grant `role` to `user` if missing, so the reassigned lead passes validation."""
    if role not in frappe.get_roles(user):
        frappe.get_doc("User", user).add_roles(role)


def _first_enabled(candidates, exclude):
    for c in candidates:
        if c and c != exclude and cint(frappe.db.get_value("User", c, "enabled")):
            return c
    return None


def _scrub_upcoming_meetings(user):
    """Drop the user from upcoming meetings; reassign organizer to lead."""
    scheduled = frappe.get_all(
        "Meeting", filters={"status": MEETING_SCHEDULED},
        fields=["name", "project", "organizer"],
    )
    if not scheduled:
        return
    for m in scheduled:
        if m.organizer == user:
            owner, leader = frappe.get_value(
                "Project", m.project, ["project_owner", "project_leader"]
            ) or (None, None)
            new_org = _first_enabled([leader, owner], user)
            if new_org:
                frappe.db.set_value("Meeting", m.name, "organizer", new_org)
            else:
                frappe.log_error(
                    message=_("Meeting {0} organized by disabled {1} has no eligible new organizer.")
                    .format(m.name, user),
                    title="Meeting organizer not reassigned",
                )
    frappe.db.delete(
        "Meeting Participant",
        {"user": user, "parent": ["in", [m.name for m in scheduled]]},
    )


def _transfer_open_todos(user):
    """Move the user's open Project Todos to project_leader, else project_owner.

    Raw update: bypasses validate_assigned_to_team_member (leader/owner may not
    be on the team — intended system override) and skips re-running
    point-ledger/recurrence hooks (open tasks have 0 earned). Recurrence still
    follows: next-occurrence generation reads assigned_to fresh from the DB.
    """
    todos = frappe.get_all(
        "Project Todo",
        filters={"assigned_to": user, "status": ["not in", TERMINAL_STATUSES]},
        fields=["name", "project"],
    )
    if not todos:
        return

    target_cache = {}
    orphans = []
    for t in todos:
        target = _resolve_target(t.project, user, target_cache)
        if not target:
            orphans.append(t.name)
            continue
        frappe.db.set_value("Project Todo", t.name, "assigned_to", target)
        # Wipe the outgoing assignee's day-plan allocation rows (see report.py):
        # left in place they get misattributed to the new assignee.
        frappe.db.delete("Project Todo Allocation", {"parent": t.name, "parenttype": "Project Todo"})

    if orphans:
        msg = _(
            "{0} of {1} open task(s) could not be reassigned after disabling {2} "
            "(no enabled project leader or owner): {3}"
        ).format(len(orphans), len(todos), user, ", ".join(orphans))
        frappe.log_error(message=msg, title="Task transfer on user disable")
        frappe.msgprint(msg, title=_("Tasks not reassigned"), indicator="orange")


def _resolve_target(project, disabled_user, cache):
    """Return an enabled user (leader, else owner) able to receive tasks, or None."""
    if project in cache:
        return cache[project]
    target = None
    if project:
        leader, owner = frappe.get_value(
            "Project", project, ["project_leader", "project_owner"]
        ) or (None, None)
        target = _first_enabled([leader, owner], disabled_user)
    cache[project] = target
    return target
