# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

"""Reassign a user's open tasks when they are deactivated.

Wired as a User `on_update` doc_event, so it fires for every disable path:
Frappe desk, the mobile `update_user()` endpoint, and the bench console.
"""

import frappe
from frappe import _
from frappe.utils import cint

# Project Todo statuses that mean "finished" — these stay with the disabled user
# as a historical record and are never reassigned. Mirrors project_todo.py.
TERMINAL_STATUSES = ("✅ Completed", "🚫 Cancelled")


def transfer_open_todos_on_disable(doc, method=None):
	"""On the enabled 1→0 transition, move the user's open Project Todos.

	Target per task (resolved from the task's Project): project_leader, else
	project_owner — whichever is set, enabled, and not the user being disabled.
	If neither qualifies, the task is left on the disabled user and reported for
	manual handling (assigned_to is required, so it cannot be emptied).
	"""
	if not (doc.has_value_changed("enabled") and not cint(doc.enabled)):
		return

	user = doc.name
	todos = frappe.get_all(
		"Project Todo",
		filters={"assigned_to": user, "status": ["not in", TERMINAL_STATUSES]},
		fields=["name", "project"],
	)
	if not todos:
		return

	target_cache = {}  # project -> resolved target user (or None), one query each
	orphans = []
	moved = 0
	for t in todos:
		target = _resolve_target(t.project, user, target_cache)
		if not target:
			orphans.append(t.name)
			continue
		# Raw update: bypasses validate_assigned_to_team_member (leader/owner may
		# not be on the team — this is an intended system override) and skips
		# re-running point-ledger/recurrence hooks (open tasks have 0 earned).
		# Recurrence still follows: next-occurrence generation reads assigned_to
		# fresh from the DB, so future occurrences inherit the new target.
		frappe.db.set_value("Project Todo", t.name, "assigned_to", target)
		# The bypass above also skips _ensure_today_allocation's reassign wipe (it
		# only runs in validate()), so repeat it here: allocation rows are the
		# outgoing assignee's personal day-plan, meaningless once someone else owns
		# the todo — and left in place they get misattributed to `target`, since
		# api/report.py (daily_estimated_time, logbook) reads allocations via the
		# todo's CURRENT assigned_to.
		frappe.db.delete("Project Todo Allocation", {"parent": t.name, "parenttype": "Project Todo"})
		moved += 1

	if orphans:
		msg = _(
			"{0} of {1} open task(s) could not be reassigned after disabling {2} "
			"(no enabled project leader or owner): {3}"
		).format(len(orphans), len(todos), user, ", ".join(orphans))
		frappe.log_error(message=msg, title="Task transfer on user disable")
		# Visible to whoever triggered the disable, when in an interactive request.
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
		for candidate in (leader, owner):
			if (
				candidate
				and candidate != disabled_user
				and cint(frappe.db.get_value("User", candidate, "enabled"))
			):
				target = candidate
				break

	cache[project] = target
	return target
