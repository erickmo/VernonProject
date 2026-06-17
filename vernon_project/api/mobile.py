# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Mobile PWA API
# --------------
# Purpose-built, permission-aware endpoints for the Vernon Project mobile app.
# These return exactly the shape the React PWA needs so the client never has to
# query child tables directly or replicate the status-workflow permission rules.

import frappe
from frappe.utils import getdate, nowdate, pretty_date, get_datetime, date_diff

# --------------------------------------------------------------------------------
# Status workflow constants
# Must match the option strings stored in `tabProject Todo`.`status` exactly
# (note the U+FE0F variation selector after the white-circle in "Planned").
# --------------------------------------------------------------------------------
STATUS_PLANNED = "⚪️ Planned"
STATUS_DONE = "\U0001f7e0 Done"
STATUS_CHECKED = "\U0001f537 Checked By PL"
STATUS_COMPLETED = "✅ Completed"

STATUS_KEY = {
	STATUS_PLANNED: "planned",
	STATUS_DONE: "done",
	STATUS_CHECKED: "checked",
	STATUS_COMPLETED: "completed",
}

# key -> (label, full status string) for the *next* step
NEXT_STATUS = {
	"planned": STATUS_DONE,
	"done": STATUS_CHECKED,
	"checked": STATUS_COMPLETED,
	"completed": None,
}

NEXT_LABEL = {
	"planned": "Mark Done",
	"done": "Check by PL",
	"checked": "Complete",
	"completed": None,
}


def _status_key(status):
	return STATUS_KEY.get(status, "planned")


def _humanize_date(value):
	"""Day-based relative label for a Date (deadline). pretty_date() can't be
	used here because it does datetime arithmetic and fails on a plain date."""
	if not value:
		return None
	days = date_diff(getdate(value), getdate(nowdate()))  # value - today
	if days == 0:
		return "Today"
	if days == 1:
		return "Tomorrow"
	if days == -1:
		return "Yesterday"
	if days > 1:
		return f"in {days} days"
	return f"{abs(days)} days ago"


def _humanize_datetime(value):
	"""Relative label for a Datetime (audit timestamps)."""
	if not value:
		return None
	try:
		return pretty_date(get_datetime(value))
	except Exception:
		return str(value)


def _can_advance(status_key, project, user, assigned_to):
	"""Mirror vernon_project.api.project_todo.update_status permission rules
	so the UI only offers an action the backend will actually accept."""
	owner = project.get("project_owner")
	leader = project.get("project_leader")
	admin = project.get("project_admin")

	# Project Admin may never advance status.
	if admin and user == admin:
		return False

	if status_key == "planned":
		return user in (owner, leader, assigned_to)
	if status_key == "done":
		return user in (owner, leader)
	if status_key == "checked":
		return user == owner
	return False


def _user_name_map(emails):
	"""Resolve a set of user emails to full names in one query."""
	emails = {e for e in emails if e}
	if not emails:
		return {}
	rows = frappe.get_all(
		"User",
		filters={"name": ["in", list(emails)]},
		fields=["name", "full_name", "user_image"],
	)
	return {r["name"]: r for r in rows}


def _visible_projects(status=None):
	"""Project names the current user is allowed to see (respects permissions)."""
	filters = {}
	if status:
		filters["status"] = status
	return frappe.get_list("Project", filters=filters, pluck="name", limit_page_length=0)


def _fetch_todos(project_names):
	"""All todos (with project + work-item context) for the given projects."""
	if not project_names:
		return []
	return frappe.db.sql(
		"""
		SELECT
			t.name, t.to_do, t.status, t.deadline, t.estimated, t.assigned_to,
			t.ongoing, t.notes, t.is_recurring,
			t.developed_by, t.developed_at, t.tested_by, t.tested_at,
			t.completed_by, t.completed_at, t.done_started_at, t.checked_started_at,
			pd.name AS project_detail, pd.title AS project_detail_title, pd.project,
			p.project_name, p.project_owner, p.project_leader, p.project_admin,
			p.customer
		FROM `tabProject Todo` t
		JOIN `tabProject Detail` pd
			ON t.project_detail = pd.name
		JOIN `tabProject` p ON pd.project = p.name
		WHERE pd.project IN %(projects)s
		ORDER BY t.deadline ASC
		""",
		{"projects": tuple(project_names)},
		as_dict=True,
	)


def _shape_todo(row, user, name_map, include_notes=False):
	skey = _status_key(row["status"])
	project = {
		"project_owner": row["project_owner"],
		"project_leader": row["project_leader"],
		"project_admin": row["project_admin"],
	}
	can_advance = skey != "completed" and _can_advance(skey, project, user, row["assigned_to"])
	overdue = bool(
		row["deadline"]
		and skey != "completed"
		and getdate(row["deadline"]) < getdate(nowdate())
	)
	assignee = name_map.get(row["assigned_to"], {})
	out = {
		"name": row["name"],
		"to_do": row["to_do"],
		"status": row["status"],
		"status_key": skey,
		"next_status_label": NEXT_LABEL.get(skey),
		"can_advance": can_advance,
		"deadline": str(row["deadline"]) if row["deadline"] else None,
		"deadline_human": _humanize_date(row["deadline"]),
		"is_overdue": overdue,
		"estimated": row["estimated"] or 0,
		"ongoing": bool(row.get("ongoing")),
		"is_recurring": bool(row.get("is_recurring")),
		"assigned_to": row["assigned_to"],
		"assigned_to_name": assignee.get("full_name") or row["assigned_to"],
		"assigned_to_image": assignee.get("user_image"),
		"project_detail": row["project_detail"],
		"project_detail_title": row["project_detail_title"],
		"project": row["project"],
		"project_name": row["project_name"],
		"brand": row.get("customer"),
		"project_owner": row.get("project_owner"),
		"project_owner_name": (name_map.get(row.get("project_owner")) or {}).get("full_name")
		or row.get("project_owner"),
		"project_leader": row.get("project_leader"),
		"project_leader_name": (name_map.get(row.get("project_leader")) or {}).get("full_name")
		or row.get("project_leader"),
		"is_mine": row["assigned_to"] == user,
	}
	if include_notes:
		out["notes"] = row.get("notes") or ""
		out["timeline"] = [
			t
			for t in [
				_event("Developed", row.get("developed_by"), row.get("developed_at"), name_map),
				_event("Checked by PL", row.get("tested_by"), row.get("tested_at"), name_map),
				_event("Completed", row.get("completed_by"), row.get("completed_at"), name_map),
			]
			if t
		]
	return out


def _shape_item_row(row, user, name_map):
	"""Lightweight project-item shape for link rows on the Project Detail screen.
	Full detail loads via get_project_item."""
	skey = _status_key(row["status"])
	assignee = name_map.get(row["assigned_to"], {})
	return {
		"name": row["name"],
		"to_do": row["to_do"],
		"status": row["status"],
		"status_key": skey,
		"deadline": str(row["deadline"]) if row["deadline"] else None,
		"deadline_human": _humanize_date(row["deadline"]),
		"is_overdue": bool(
			row["deadline"] and skey != "completed"
			and getdate(row["deadline"]) < getdate(nowdate())
		),
		"assigned_to": row["assigned_to"],
		"assigned_to_name": assignee.get("full_name") or row["assigned_to"],
	}


def _event(label, by, at, name_map):
	if not at:
		return None
	person = name_map.get(by, {})
	return {
		"label": label,
		"by": by,
		"by_name": person.get("full_name") or by,
		"at": str(at),
		"at_human": _humanize_datetime(at),
	}


# --------------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------------


@frappe.whitelist()
def bootstrap():
	"""Identity + role info for the logged-in user (drives onboarding & nav)."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	u = frappe.get_value(
		"User", user, ["full_name", "user_image", "email"], as_dict=True
	) or {}
	roles = frappe.get_roles(user)
	vernon_roles = [
		r
		for r in ("Project Owner", "Project Leader", "Project Admin", "Project Team", "System Manager")
		if r in roles
	]
	return {
		"user": user,
		"full_name": u.get("full_name") or user,
		"image": u.get("user_image"),
		"roles": vernon_roles,
		"is_leader": any(r in roles for r in ("Project Owner", "Project Leader", "System Manager")),
	}


@frappe.whitelist()
def get_dashboard():
	"""Everything the Today + Review tabs need, in one round-trip."""
	user = frappe.session.user
	projects = _visible_projects()
	rows = _fetch_todos(projects)

	emails = {r["assigned_to"] for r in rows}
	for r in rows:
		emails.update(
			[r["developed_by"], r["tested_by"], r["completed_by"], r["project_owner"], r["project_leader"]]
		)
	name_map = _user_name_map(emails)

	today = getdate(nowdate())
	overdue, due_today, upcoming, review = [], [], [], []

	for r in rows:
		shaped = _shape_todo(r, user, name_map)
		skey = shaped["status_key"]

		# Review queue: items awaiting an action *I* am allowed to take.
		if shaped["can_advance"] and skey in ("done", "checked"):
			review.append(shaped)

		# My personal work: assigned to me, not yet completed.
		if shaped["is_mine"] and skey != "completed":
			if shaped["is_overdue"]:
				overdue.append(shaped)
			elif shaped["deadline"] and getdate(shaped["deadline"]) == today:
				due_today.append(shaped)
			else:
				upcoming.append(shaped)

	# Sort review oldest-waiting first (by deadline already asc); overdue first within review
	review.sort(key=lambda t: (not t["is_overdue"], t["deadline"] or "9999"))
	upcoming.sort(key=lambda t: t["deadline"] or "9999")

	completed_today = sum(
		1
		for r in rows
		if r["assigned_to"] == user
		and r["completed_at"]
		and str(r["completed_at"])[:10] == str(today)
	)

	return {
		"counts": {
			"overdue": len(overdue),
			"due_today": len(due_today),
			"upcoming": len(upcoming),
			"review": len(review),
			"completed_today": completed_today,
		},
		"overdue": overdue,
		"due_today": due_today,
		"upcoming": upcoming,
		"review": review,
	}


@frappe.whitelist()
def get_projects():
	"""Project cards with progress + overdue rollups for the Projects tab."""
	user = frappe.session.user
	plist = frappe.get_list(
		"Project",
		fields=[
			"name", "project_name", "status", "customer", "start_date",
			"deadline", "project_owner", "project_leader", "project_admin", "goal",
		],
		order_by="modified desc",
		limit_page_length=0,
	)
	if not plist:
		return []

	names = [p["name"] for p in plist]
	rows = _fetch_todos(names)
	# Which of these projects the current user is a team member of.
	member_of = set(
		frappe.get_all(
			"Project Team",
			filters={"parent": ["in", names], "user": user},
			pluck="parent",
			limit_page_length=0,
		)
	)
	today = getdate(nowdate())

	stats = {n: {"total": 0, "done": 0, "overdue": 0, "review": 0} for n in names}
	for r in rows:
		s = stats[r["project"]]
		s["total"] += 1
		skey = _status_key(r["status"])
		if skey == "completed":
			s["done"] += 1
		else:
			if r["deadline"] and getdate(r["deadline"]) < today:
				s["overdue"] += 1
		if skey in ("done", "checked"):
			s["review"] += 1

	name_map = _user_name_map({p["project_owner"] for p in plist} | {p["project_leader"] for p in plist})
	for p in plist:
		s = stats[p["name"]]
		p["item_total"] = s["total"]
		p["item_done"] = s["done"]
		p["overdue"] = s["overdue"]
		p["review"] = s["review"]
		p["progress"] = round(s["done"] / s["total"] * 100) if s["total"] else 0
		p["start_date"] = str(p["start_date"]) if p["start_date"] else None
		p["deadline"] = str(p["deadline"]) if p["deadline"] else None
		p["owner_name"] = (name_map.get(p["project_owner"]) or {}).get("full_name") or p["project_owner"]
		p["leader_name"] = (name_map.get(p["project_leader"]) or {}).get("full_name") or p["project_leader"]
		# Relationship of the current user to this project (drives dashboard lenses)
		p["is_owner"] = p["project_owner"] == user
		p["is_leader"] = p["project_leader"] == user
		p["is_admin"] = p.get("project_admin") == user
		p["is_member"] = p["name"] in member_of
	return plist


@frappe.whitelist()
def get_project(project):
	"""Single project: meta, team workload, and its work items with rollups."""
	user = frappe.session.user
	if project not in _visible_projects():
		frappe.throw("Not permitted", frappe.PermissionError)

	doc = frappe.get_doc("Project", project)
	rows = _fetch_todos([project])
	today = getdate(nowdate())

	# Project-detail rollups. Seed from every Project Detail so items with zero
	# todos (e.g. a freshly added feature) still show up — _fetch_todos
	# inner-joins todos and would otherwise drop them.
	items = {}
	for d in frappe.get_all(
		"Project Detail",
		filters={"project": project},
		fields=["name", "title"],
		limit_page_length=0,
	):
		items[d["name"]] = {
			"name": d["name"],
			"title": d["title"],
			"total": 0,
			"done": 0,
			"overdue": 0,
		}

	workload = {}
	for r in rows:
		wi = items.setdefault(
			r["project_detail"],
			{"name": r["project_detail"], "title": r["project_detail_title"], "total": 0, "done": 0, "overdue": 0},
		)
		wi["total"] += 1
		skey = _status_key(r["status"])
		if skey == "completed":
			wi["done"] += 1
		elif r["deadline"] and getdate(r["deadline"]) < today:
			wi["overdue"] += 1
		if r["assigned_to"] and skey != "completed":
			workload[r["assigned_to"]] = workload.get(r["assigned_to"], 0) + 1

	for wi in items.values():
		wi["progress"] = round(wi["done"] / wi["total"] * 100) if wi["total"] else 0

	# Effective roster: owner + leader + formal Project Team members, unioned
	# with anyone carrying open-todo load (an assignee need not be a formal
	# member). Everyone shows even with zero load.
	member_users = set(
		frappe.get_all(
			"Project Team", filters={"parent": project}, pluck="user", limit_page_length=0
		)
	)
	roster = set(member_users) | {doc.project_owner, doc.project_leader} | set(workload.keys())
	roster.discard(None)

	name_map = _user_name_map(roster)
	team = [
		{
			"user": email,
			"name": (name_map.get(email) or {}).get("full_name") or email,
			"image": (name_map.get(email) or {}).get("user_image"),
			"open_todos": workload.get(email, 0),
			"is_owner": email == doc.project_owner,
			"is_leader": email == doc.project_leader,
			"is_member": email in member_users or email in (doc.project_owner, doc.project_leader),
		}
		for email in roster
	]

	def _rank(m):
		# Owner first, leader second, then heaviest load, then name.
		role = 0 if m["is_owner"] else (1 if m["is_leader"] else 2)
		return (role, -m["open_todos"], m["name"].lower())

	team.sort(key=_rank)

	return {
		"name": doc.name,
		"project_name": doc.project_name,
		"status": doc.status,
		"customer": doc.customer,
		"goal": doc.goal,
		"start_date": str(doc.start_date) if doc.start_date else None,
		"deadline": str(doc.deadline) if doc.deadline else None,
		"owner_name": (name_map.get(doc.project_owner) or {}).get("full_name") or doc.project_owner,
		"leader_name": (name_map.get(doc.project_leader) or {}).get("full_name") or doc.project_leader,
		"project_owner": doc.project_owner,
		"project_leader": doc.project_leader,
		"project_admin": doc.project_admin,
		"project_group": doc.project_group,
		"groupings": frappe.get_all(
			"Glossary", filters={"project": doc.name}, pluck="glossary", limit_page_length=0
		),
		"project_details": sorted(items.values(), key=lambda w: w["title"] or ""),
		"team": team,
	}


@frappe.whitelist()
def get_member_workload(project, user, include_completed=0):
	"""One member's todos within a project. Open-only unless include_completed."""
	if project not in _visible_projects():
		frappe.throw("Not permitted", frappe.PermissionError)

	include_completed = frappe.utils.cint(include_completed)
	me = frappe.session.user
	rows = [r for r in _fetch_todos([project]) if r["assigned_to"] == user]
	name_map = _user_name_map({user})
	out = []
	for r in rows:
		skey = _status_key(r["status"])
		if not include_completed and skey == "completed":
			continue
		shaped = _shape_todo(r, me, name_map)
		out.append({
			"name": shaped["name"],
			"to_do": shaped["to_do"],
			"status": shaped["status"],
			"status_key": shaped["status_key"],
			"deadline": shaped["deadline"],
			"deadline_human": shaped["deadline_human"],
			"is_overdue": shaped["is_overdue"],
			"project_detail": shaped["project_detail"],
			"project_detail_title": shaped["project_detail_title"],
		})
	return out


@frappe.whitelist()
def get_project_detail(project_detail):
	"""A Project Detail with its project items."""
	user = frappe.session.user
	detail = frappe.get_value(
		"Project Detail", project_detail,
		["name", "title", "project", "status", "current_condition", "expected_outcome", "grouping"],
		as_dict=True,
	)
	if not detail:
		frappe.throw("Not found", frappe.DoesNotExistError)
	if detail["project"] not in _visible_projects():
		frappe.throw("Not permitted", frappe.PermissionError)

	rows = [r for r in _fetch_todos([detail["project"]]) if r["project_detail"] == project_detail]
	emails = {r["assigned_to"] for r in rows}
	name_map = _user_name_map(emails)
	detail["project_name"] = frappe.get_value("Project", detail["project"], "project_name")
	detail["project_items"] = [_shape_item_row(r, user, name_map) for r in rows]

	# Lead-only "create task" gate + team list for the assignee picker.
	owner, leader = frappe.get_value(
		"Project", detail["project"], ["project_owner", "project_leader"]
	)
	is_sm = "System Manager" in frappe.get_roles(user)
	detail["can_create"] = is_sm or user in (owner, leader)
	detail["can_edit"] = is_sm or user in (owner, leader)
	detail["groupings"] = frappe.get_all(
		"Glossary", filters={"project": detail["project"]}, pluck="glossary", limit_page_length=0
	)

	team_rows = frappe.get_all(
		"Project Team", filters={"parent": detail["project"]}, fields=["user"],
		limit_page_length=0,
	)
	team_map = _user_name_map({tr["user"] for tr in team_rows})
	detail["team"] = [
		{
			"user": tr["user"],
			"name": (team_map.get(tr["user"]) or {}).get("full_name") or tr["user"],
			"image": (team_map.get(tr["user"]) or {}).get("user_image"),
		}
		for tr in team_rows
	]
	return detail


@frappe.whitelist()
def get_project_item(project_item):
	"""Full detail of one project item including notes + audit timeline + permission flags."""
	user = frappe.session.user
	project_detail = frappe.get_value("Project Todo", project_item, "project_detail")
	if not project_detail:
		frappe.throw("Not found", frappe.DoesNotExistError)
	project = frappe.get_value("Project Detail", project_detail, "project")
	if project not in _visible_projects():
		frappe.throw("Not permitted", frappe.PermissionError)

	rows = [r for r in _fetch_todos([project]) if r["name"] == project_item]
	if not rows:
		frappe.throw("Not found", frappe.DoesNotExistError)
	r = rows[0]
	team_rows = frappe.get_all(
		"Project Team", filters={"parent": r["project"]}, fields=["user"], limit_page_length=0
	)
	team_emails = {tr["user"] for tr in team_rows}
	emails = {r["assigned_to"], r["developed_by"], r["tested_by"], r["completed_by"]} | team_emails
	name_map = _user_name_map(emails)
	shaped = _shape_todo(r, user, name_map, include_notes=True)
	shaped["can_edit_notes"] = user in (
		r["assigned_to"], r["project_owner"], r["project_leader"]
	)
	# Full-task edit is a lead action; assignee/deadline/estimate are locked once
	# the task is Done/Completed (enforced by the doctype's validate()).
	is_sm = "System Manager" in frappe.get_roles(user)
	shaped["can_edit"] = is_sm or user in (
		r["project_owner"], r["project_leader"], r["assigned_to"]
	)
	shaped["fields_locked"] = shaped["status_key"] in ("done", "completed")

	# Per-phase estimates + recurrence settings + occurrence history
	extra = frappe.get_value(
		"Project Todo",
		project_item,
		[
			"estimated_planned_to_done",
			"estimated_done_to_checked",
			"estimated_checked_to_completed",
			"total_estimated_hours",
			"is_recurring",
			"recurring_frequency",
			"recurring_until",
			"original_todo",
		],
		as_dict=True,
	) or {}
	shaped["phase_estimates"] = {
		"planned_to_done": extra.get("estimated_planned_to_done") or 0,
		"done_to_checked": extra.get("estimated_done_to_checked") or 0,
		"checked_to_completed": extra.get("estimated_checked_to_completed") or 0,
		"total": extra.get("total_estimated_hours") or 0,
	}
	shaped["recurring"] = {
		"is_recurring": bool(extra.get("is_recurring")),
		"frequency": extra.get("recurring_frequency"),
		"until": str(extra.get("recurring_until")) if extra.get("recurring_until") else None,
	}

	# Occurrence history: all project items in this recurring series (root + children).
	root = extra.get("original_todo") or project_item
	sib = frappe.db.sql(
		"""
		SELECT name, to_do, status, deadline FROM `tabProject Todo`
		WHERE name = %(root)s OR original_todo = %(root)s
		ORDER BY deadline ASC, creation ASC
		""",
		{"root": root},
		as_dict=True,
	)
	shaped["occurrences"] = [
		{
			"name": s["name"],
			"status_key": _status_key(s["status"]),
			"deadline": str(s["deadline"]) if s["deadline"] else None,
			"deadline_human": _humanize_date(s["deadline"]),
			"is_current": s["name"] == project_item,
		}
		for s in sib
	]
	# Missed = recurring, not completed, and a later occurrence already exists.
	this_dl = r["deadline"]
	has_newer = any(
		s["deadline"] and this_dl and getdate(s["deadline"]) > getdate(this_dl) for s in sib
	)
	shaped["is_missed"] = (
		bool(extra.get("is_recurring")) and shaped["status_key"] != "completed" and has_newer
	)
	shaped["team"] = [
		{
			"user": e,
			"name": (name_map.get(e) or {}).get("full_name") or e,
			"image": (name_map.get(e) or {}).get("user_image"),
		}
		for e in sorted(team_emails)
	]
	return shaped


@frappe.whitelist()
def update_todo(
	project_item,
	to_do=None,
	deadline=None,
	estimated=None,
	assigned_to=None,
	is_recurring=None,
	recurring_frequency=None,
	recurring_until=None,
	estimated_planned_to_done=None,
	estimated_done_to_checked=None,
	estimated_checked_to_completed=None,
):
	"""Edit a task's fields. Returns a clean status/message so the mobile UI can
	show friendly feedback instead of a raw traceback."""
	try:
		user = frappe.session.user
		project_detail = frappe.get_value("Project Todo", project_item, "project_detail")
		if not project_detail:
			return {"status": "error", "message": "Task not found."}
		detail_project = frappe.get_value("Project Detail", project_detail, "project")
		project = frappe.get_doc("Project", detail_project)

		# Load the task as its own document. Saving it directly (like update_status
		# does) runs the Project Todo controller — which sums per-phase estimates
		# into total_estimated_hours, sets next_occurrence for recurring tasks, and
		# enforces the locked-field rules. Saving via the parent would skip all that.
		row = frappe.get_doc("Project Todo", project_item)

		is_sm = "System Manager" in frappe.get_roles(user)
		if not (is_sm or user in (project.project_owner, project.project_leader, row.assigned_to)):
			return {
				"status": "error",
				"message": "You don't have permission to edit this task.",
			}

		if to_do is not None and to_do.strip():
			row.to_do = to_do.strip()
		if deadline is not None:
			row.deadline = deadline
		if estimated is not None and estimated != "":
			row.estimated = int(estimated)
		if assigned_to is not None and assigned_to:
			row.assigned_to = assigned_to

		# Recurring settings
		if is_recurring is not None:
			row.is_recurring = 1 if str(is_recurring) in ("1", "true", "True") else 0
			if not row.is_recurring:
				row.recurring_frequency = None
				row.recurring_until = None
				row.next_occurrence = None
		if recurring_frequency is not None:
			row.recurring_frequency = recurring_frequency or None
		if recurring_until is not None:
			row.recurring_until = recurring_until or None

		# Per-phase estimates (controller sums these into total_estimated_hours)
		for fld, val in (
			("estimated_planned_to_done", estimated_planned_to_done),
			("estimated_done_to_checked", estimated_done_to_checked),
			("estimated_checked_to_completed", estimated_checked_to_completed),
		):
			if val is not None and val != "":
				row.set(fld, float(val))

		# Re-arm the next occurrence when (re)enabling recurrence.
		if row.is_recurring and row.recurring_frequency and not row.next_occurrence:
			row.next_occurrence = row.calculate_next_occurrence(row.deadline)

		row.save(ignore_permissions=True)
		return {"status": "ok", "message": "Task updated."}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": "Task not found."}
	except Exception as e:
		# Surface the validation message (e.g. locked-field edit) cleanly.
		msg = frappe.utils.strip_html(str(e)).strip() or "Could not save changes."
		return {"status": "error", "message": msg}


# --------------------------------------------------------------------------------
# Reports (mobile)
# Reuse the existing Script Reports via the standard query-report runner so the
# numbers always match the desk.
# --------------------------------------------------------------------------------

ALLOWED_REPORTS = {
	"Progress Report",
	"Todo Report",
	"Project Todo Deadline Report",
	"Daily Assignment Report",
	"Daily Performance Report",
}


@frappe.whitelist()
def get_report_options():
	"""Option lists used by the mobile report filters (project & assignee pickers)."""
	projects = _visible_projects()
	proj_list = [
		{"value": p, "label": frappe.get_value("Project", p, "project_name") or p}
		for p in projects
	]
	users = set()
	if projects:
		rows = frappe.get_all(
			"Project Team", filters={"parent": ["in", projects]}, fields=["user"], limit_page_length=0
		)
		users = {r["user"] for r in rows}
	nm = _user_name_map(users)
	user_list = sorted(
		[{"value": u, "label": (nm.get(u) or {}).get("full_name") or u} for u in users],
		key=lambda x: x["label"],
	)
	# Status option sets, sourced from the canonical constants so the emoji +
	# variation-selectors match exactly what is stored (reports filter on equality).
	def opts(values):
		return [{"value": v, "label": v} for v in values]

	return {
		"projects": sorted(proj_list, key=lambda x: x["label"]),
		"users": user_list,
		"todo_statuses": opts([STATUS_PLANNED, STATUS_DONE, STATUS_CHECKED, STATUS_COMPLETED]),
		"pd_statuses": opts(["Ongoing", "Completed", "On Hold"]),
		"perf_statuses": opts([STATUS_DONE, STATUS_CHECKED, STATUS_COMPLETED]),
	}


@frappe.whitelist()
def run_report(report, filters=None):
	"""Run one of the whitelisted Script Reports and return columns + rows."""
	if report not in ALLOWED_REPORTS:
		frappe.throw("Unknown report.")

	if isinstance(filters, str):
		filters = frappe.parse_json(filters or "{}")
	filters = filters or {}
	# Drop empty values so each report falls back to its own defaults.
	filters = {k: v for k, v in filters.items() if v not in (None, "", [])}

	from frappe.desk.query_report import run as _run

	# Capture any frappe.msgprint() the report emits (e.g. "select a project")
	# so the mobile UI can explain empty results instead of showing a blank table.
	frappe.local.message_log = []
	res = _run(report, filters=filters, ignore_prepared_report=True)
	messages = []
	for m in frappe.local.message_log or []:
		txt = m.get("message") if isinstance(m, dict) else str(m)
		if txt:
			messages.append(frappe.utils.strip_html(txt))
	frappe.local.message_log = []

	columns = []
	for c in res.get("columns", []):
		if isinstance(c, dict):
			columns.append(
				{
					"label": c.get("label"),
					"fieldname": c.get("fieldname"),
					"fieldtype": c.get("fieldtype") or "Data",
				}
			)
		else:
			parts = str(c).split(":")
			columns.append(
				{
					"label": parts[0],
					"fieldname": parts[0].strip().lower().replace(" ", "_"),
					"fieldtype": parts[1] if len(parts) > 1 else "Data",
				}
			)

	rows = res.get("result") or res.get("data") or []
	return {"columns": columns, "rows": rows[:300], "total": len(rows), "messages": messages}


@frappe.whitelist()
def get_form_options():
	"""Option lists for the project create/edit form (customers, users, groups).

	Uses ``frappe.get_all`` (no per-doctype read gate) so non-System-Manager
	project leads get the User list too — ``/api/resource/User`` is restricted
	to System Manager, which would 403 a raw resource list of users.
	"""
	customers = frappe.get_all("Customer", fields=["name", "customer_name"], limit_page_length=0)
	users = frappe.get_all(
		"User",
		filters={"enabled": 1, "name": ["not in", ("Guest",)]},
		fields=["name", "full_name"],
		limit_page_length=0,
	)
	groups = frappe.get_all("Project Group", fields=["name"], limit_page_length=0)
	return {
		"customers": sorted(
			[{"value": c["name"], "label": c.get("customer_name") or c["name"]} for c in customers],
			key=lambda x: x["label"],
		),
		"users": sorted(
			[{"value": u["name"], "label": u.get("full_name") or u["name"]} for u in users],
			key=lambda x: x["label"],
		),
		"project_groups": sorted(
			[{"value": g["name"], "label": g["name"]} for g in groups],
			key=lambda x: x["label"],
		),
	}
