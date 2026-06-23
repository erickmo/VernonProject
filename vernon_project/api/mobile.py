# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Mobile PWA API
# --------------
# Purpose-built, permission-aware endpoints for the Vernon Project mobile app.
# These return exactly the shape the React PWA needs so the client never has to
# query child tables directly or replicate the status-workflow permission rules.

import json

import frappe
from frappe.utils import getdate, nowdate, pretty_date, get_datetime, date_diff, now_datetime, add_days

# --------------------------------------------------------------------------------
# Status workflow constants
# Must match the option strings stored in `tabProject Todo`.`status` exactly
# (note the U+FE0F variation selector after the white-circle in "Planned").
# --------------------------------------------------------------------------------
VERNON_ROLES = ("Project Owner", "Project Leader", "Project Admin", "Project Team", "Points Granter")
PROTECTED_USERS = ("Guest", "Administrator")


def _require_system_manager():
	if "System Manager" not in frappe.get_roles(frappe.session.user):
		frappe.throw("Not permitted", frappe.PermissionError)


STATUS_PLANNED = "⚪️ Planned"
STATUS_DONE = "\U0001f7e0 Done"
STATUS_CHECKED = "\U0001f537 Checked By PL"
STATUS_COMPLETED = "✅ Completed"
STATUS_CANCELLED = "\U0001f6ab Cancelled"

STATUS_KEY = {
	STATUS_PLANNED: "planned",
	STATUS_DONE: "done",
	STATUS_CHECKED: "checked",
	STATUS_COMPLETED: "completed",
	STATUS_CANCELLED: "cancelled",
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
	"done": "Approve (Leader)",
	"checked": "Approve (Owner)",
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


def _involved_project_names(user):
	"""Projects the user is involved in: owner / leader / admin, a Project Team
	member, or assigned to any todo in the project."""
	names = set()
	for role_field in ("project_owner", "project_leader", "project_admin"):
		names |= set(
			frappe.get_all("Project", filters={role_field: user}, pluck="name", limit_page_length=0)
		)
	names |= set(
		frappe.get_all("Project Team", filters={"user": user}, pluck="parent", limit_page_length=0)
	)
	# Assigned a todo -> resolve its Project Detail -> project.
	details = set(
		frappe.get_all("Project Todo", filters={"assigned_to": user}, pluck="project_detail", limit_page_length=0)
	)
	if details:
		names |= set(
			frappe.get_all(
				"Project Detail", filters={"name": ["in", list(details)]}, pluck="project", limit_page_length=0
			)
		)
	return names


def _visible_projects(status=None):
	"""Project names the current user may see. Frappe-permitted, and — unless the
	user is a System Manager — restricted to projects they are involved in
	(owner/leader/admin, team member, or assignee)."""
	user = frappe.session.user
	filters = {}
	if status:
		filters["status"] = status
	allowed = frappe.get_list("Project", filters=filters, pluck="name", limit_page_length=0)
	if "System Manager" in frappe.get_roles(user):
		return allowed
	involved = _involved_project_names(user)
	return [n for n in allowed if n in involved]


def _fetch_todos(project_names, include_cancelled=False):
	"""All todos (with project + work-item context) for the given projects.
	Cancelled todos are excluded unless include_cancelled is True."""
	if not project_names:
		return []
	cond = "" if include_cancelled else "AND t.status != %(cancelled)s"
	return frappe.db.sql(
		f"""
		SELECT
			t.name, t.to_do, t.status, t.deadline, t.leader_deadline, t.owner_deadline,
			t.estimated, t.assigned_to,
			t.ongoing, t.notes, t.is_recurring,
			t.`group` AS `group`, t.level, t.point, t.assignee_earned, t.leader_earned,
			t.developed_by, t.developed_at, t.tested_by, t.tested_at,
			t.completed_by, t.completed_at, t.done_started_at, t.checked_started_at,
			pd.name AS project_detail, pd.title AS project_detail_title, pd.project,
			p.project_name, p.project_owner, p.project_leader, p.project_admin,
			p.brand
		FROM `tabProject Todo` t
		JOIN `tabProject Detail` pd
			ON t.project_detail = pd.name
		JOIN `tabProject` p ON pd.project = p.name
		WHERE pd.project IN %(projects)s {cond}
		ORDER BY t.deadline ASC
		""",
		{"projects": tuple(project_names), "cancelled": STATUS_CANCELLED},
		as_dict=True,
	)


@frappe.whitelist()
def get_project_gantt(project):
	"""Gantt bars for a project: todos grouped by project detail.

	Each bar spans the first day-allocation date -> deadline (falls back to a
	1-day marker on whichever exists). Returns [{title, bars:[...]}].
	"""
	if project not in _visible_projects():
		frappe.throw("Not permitted", frappe.PermissionError)
	rows = _fetch_todos([project])
	alloc = _allocations_map([r["name"] for r in rows])
	name_map = _user_name_map({r["assigned_to"] for r in rows if r.get("assigned_to")})
	groups = {}
	for r in rows:
		dates = sorted(a["date"] for a in alloc.get(r["name"], []) if a.get("date"))
		dl = str(r["deadline"]) if r["deadline"] else None
		if not dates and not dl:
			continue
		start = dates[0] if dates else dl
		end = dl if dl else dates[-1]
		if end < start:
			end = start
		skey = _status_key(r["status"])
		g = groups.setdefault(
			r["project_detail"],
			{"detail": r["project_detail"], "title": r["project_detail_title"] or r["project_detail"], "bars": []},
		)
		g["bars"].append({
			"id": r["name"],
			"label": r["to_do"],
			"start": start,
			"end": end,
			"statusKey": skey,
			"overdue": bool(dl and skey != "completed" and getdate(dl) < getdate(nowdate())),
			"sub": (name_map.get(r["assigned_to"]) or {}).get("full_name") or r.get("assigned_to"),
		})
	out = []
	for g in groups.values():
		g["bars"].sort(key=lambda b: b["start"])
		out.append(g)
	out.sort(key=lambda g: g["title"] or "")
	return out


def _allocations_map(todo_names):
	"""Batch-fetch day allocations for many todos: {todo_name: [{date, minutes}]}."""
	names = [n for n in todo_names if n]
	if not names:
		return {}
	rows = frappe.get_all(
		"Project Todo Allocation",
		filters={"parent": ["in", names]},
		fields=["parent", "allocation_date", "estimated_minutes", "note"],
		order_by="allocation_date asc",
		limit_page_length=0,
	)
	m = {}
	for r in rows:
		m.setdefault(r["parent"], []).append({
			"date": str(r["allocation_date"]) if r["allocation_date"] else None,
			"minutes": r["estimated_minutes"] or 0,
			"note": r["note"] or "",
		})
	return m


def _shape_todo(row, user, name_map, include_notes=False, alloc_map=None):
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
	# Phase approval deadlines fire as overdue only while the task is actually
	# waiting in that phase: Done -> awaiting leader, Checked -> awaiting owner.
	leader_appr_overdue = bool(
		row.get("leader_deadline")
		and skey == "done"
		and getdate(row["leader_deadline"]) < getdate(nowdate())
	)
	owner_appr_overdue = bool(
		row.get("owner_deadline")
		and skey == "checked"
		and getdate(row["owner_deadline"]) < getdate(nowdate())
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
		"leader_deadline": str(row["leader_deadline"]) if row.get("leader_deadline") else None,
		"leader_deadline_human": _humanize_date(row.get("leader_deadline")),
		"owner_deadline": str(row["owner_deadline"]) if row.get("owner_deadline") else None,
		"owner_deadline_human": _humanize_date(row.get("owner_deadline")),
		"leader_appr_overdue": leader_appr_overdue,
		"owner_appr_overdue": owner_appr_overdue,
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
		"brand": row.get("brand"),
		"project_owner": row.get("project_owner"),
		"project_owner_name": (name_map.get(row.get("project_owner")) or {}).get("full_name")
		or row.get("project_owner"),
		"project_leader": row.get("project_leader"),
		"project_leader_name": (name_map.get(row.get("project_leader")) or {}).get("full_name")
		or row.get("project_leader"),
		"is_mine": row["assigned_to"] == user,
		# Relationship of the current user to this todo's project (drives the
		# Review tab "I own / I led" lens). Mirrors get_projects (is_owner/is_leader).
		"is_owner": row.get("project_owner") == user,
		"is_leader": row.get("project_leader") == user,
		"group": row.get("group"),
		"level": row.get("level"),
		"point": row.get("point") or 0,
		"assignee_earned": row.get("assignee_earned") or 0,
		"leader_earned": row.get("leader_earned") or 0,
	}
	# Day allocations (assignee's per-day plan; not scored). alloc_map avoids N+1
	# in list contexts; for a single todo fetch directly when no map is supplied.
	if alloc_map is None:
		allocs = _allocations_map([row["name"]]).get(row["name"], [])
	else:
		allocs = alloc_map.get(row["name"], [])
	today = str(nowdate())
	today_alloc = 0
	for a in allocs:
		if a["date"] == today:
			today_alloc += a["minutes"] or 0
	out["allocations"] = allocs
	out["allocated_total"] = sum((a["minutes"] or 0) for a in allocs)
	out["today_allocation"] = today_alloc
	if include_notes:
		out["notes"] = row.get("notes") or ""
		out["timeline"] = [
			t
			for t in [
				_event("Marked Done", row.get("developed_by"), row.get("developed_at"), name_map),
				_event("Approved by Leader", row.get("tested_by"), row.get("tested_at"), name_map),
				_event("Approved by Owner", row.get("completed_by"), row.get("completed_at"), name_map),
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
		for r in ("Project Owner", "Project Leader", "Project Admin", "Project Team", "System Manager", "Marketplace Manager", "Points Granter")
		if r in roles
	]
	return {
		"user": user,
		"full_name": u.get("full_name") or user,
		"image": u.get("user_image"),
		"roles": vernon_roles,
		"is_leader": any(r in roles for r in ("Project Owner", "Project Leader", "System Manager")),
		"badge": _user_badge(user),
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
	alloc_map = _allocations_map([r["name"] for r in rows])

	today = getdate(nowdate())
	overdue, due_today, upcoming, review = [], [], [], []

	for r in rows:
		shaped = _shape_todo(r, user, name_map, alloc_map=alloc_map)
		skey = shaped["status_key"]

		# Review queue: items awaiting an action *I* am allowed to take.
		if shaped["can_advance"] and skey in ("done", "checked"):
			review.append(shaped)

		# My personal work = my Planned tasks (own to-do). Once I mark a task
		# Done it leaves my queue and becomes the Leader's to-do (see Review).
		if shaped["is_mine"] and skey == "planned":
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
			"name", "project_name", "status", "brand", "start_date",
			"deadline", "project_owner", "project_leader", "project_admin", "goal",
		],
		order_by="modified desc",
		limit_page_length=0,
	)
	# Restrict to projects the user is involved in (System Managers see all).
	visible = set(_visible_projects())
	plist = [p for p in plist if p["name"] in visible]
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

	# Daily allocation = per-role queue:
	#   team member -> own Planned tasks (their work to do)
	#   project leader -> + all Done tasks (queue to approve as Leader)
	#   project owner  -> + all Checked tasks (queue to approve as Owner)
	# A Done task becomes the leader's to-do; a Checked task the owner's to-do.
	workload = {}
	done_queue = 0
	checked_queue = 0
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
		if r["assigned_to"] and skey == "planned":
			workload[r["assigned_to"]] = workload.get(r["assigned_to"], 0) + 1
		elif skey == "done":
			done_queue += 1
		elif skey == "checked":
			checked_queue += 1

	if doc.project_leader:
		workload[doc.project_leader] = workload.get(doc.project_leader, 0) + done_queue
	if doc.project_owner:
		workload[doc.project_owner] = workload.get(doc.project_owner, 0) + checked_queue

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
		"brand": doc.brand,
		"goal": doc.goal,
		"start_date": str(doc.start_date) if doc.start_date else None,
		"deadline": str(doc.deadline) if doc.deadline else None,
		"owner_name": (name_map.get(doc.project_owner) or {}).get("full_name") or doc.project_owner,
		"leader_name": (name_map.get(doc.project_leader) or {}).get("full_name") or doc.project_leader,
		"project_owner": doc.project_owner,
		"project_leader": doc.project_leader,
		"project_admin": doc.project_admin,
		"blocked_by": doc.blocked_by,
		"blocked_by_name": frappe.get_value("Project", doc.blocked_by, "project_name") if doc.blocked_by else None,
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
	alloc_map = _allocations_map([r["name"] for r in rows])
	out = []
	for r in rows:
		skey = _status_key(r["status"])
		if not include_completed and skey == "completed":
			continue
		shaped = _shape_todo(r, me, name_map, alloc_map=alloc_map)
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
			"allocations": shaped["allocations"],
			"allocated_total": shaped["allocated_total"],
			"today_allocation": shaped["today_allocation"],
		})
	return out


COMMENTABLE = {"Project", "Project Detail", "Project Todo"}


def _comment_project(reference_doctype, reference_name):
	"""Resolve a commentable reference to its owning Project name."""
	if reference_doctype == "Project":
		return reference_name
	if reference_doctype == "Project Detail":
		return frappe.get_value("Project Detail", reference_name, "project")
	if reference_doctype == "Project Todo":
		pd = frappe.get_value("Project Todo", reference_name, "project_detail")
		return frappe.get_value("Project Detail", pd, "project") if pd else None
	return None


def _assert_comment_visible(reference_doctype, reference_name):
	if reference_doctype not in COMMENTABLE:
		frappe.throw("Comments are not available for this record.")
	project = _comment_project(reference_doctype, reference_name)
	if not project or project not in _visible_projects():
		frappe.throw("Not permitted", frappe.PermissionError)


def _shape_comment(row, name_map):
	by = row.get("comment_email") or row.get("comment_by")
	person = name_map.get(by, {})
	return {
		"name": row["name"],
		"content": row.get("content") or "",
		"by": by,
		"by_name": person.get("full_name") or by,
		"by_image": person.get("user_image"),
		"at": str(row["creation"]),
		"at_human": _humanize_datetime(row["creation"]),
	}


@frappe.whitelist()
def get_comments(reference_doctype, reference_name):
	"""Built-in Frappe comments for a Project / Project Detail / Project Item."""
	_assert_comment_visible(reference_doctype, reference_name)
	rows = frappe.get_all(
		"Comment",
		filters={
			"comment_type": "Comment",
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
		},
		fields=["name", "content", "comment_email", "comment_by", "creation"],
		order_by="creation desc",
		limit_page_length=0,
	)
	name_map = _user_name_map({r.get("comment_email") for r in rows} | {r.get("comment_by") for r in rows})
	return [_shape_comment(r, name_map) for r in rows]


@frappe.whitelist()
def add_comment(reference_doctype, reference_name, content):
	"""Add a built-in comment to a Project / Project Detail / Project Item."""
	_assert_comment_visible(reference_doctype, reference_name)
	content = (content or "").strip()
	if not content:
		frappe.throw("Comment cannot be empty.")
	doc = frappe.get_doc(reference_doctype, reference_name)
	c = doc.add_comment("Comment", content)
	name_map = _user_name_map({c.comment_email, c.comment_by})
	return _shape_comment(
		{
			"name": c.name,
			"content": c.content,
			"comment_email": c.comment_email,
			"comment_by": c.comment_by,
			"creation": c.creation,
		},
		name_map,
	)


@frappe.whitelist()
def get_project_detail(project_detail, include_cancelled=0):
	"""A Project Detail with its project items."""
	user = frappe.session.user
	detail = frappe.get_value(
		"Project Detail", project_detail,
		["name", "title", "project", "status", "is_pending", "current_condition",
		 "expected_outcome", "grouping", "keterangan_di_sow", "discount", "price",
		 "latest_deadline", "project_deadline"],
		as_dict=True,
	)
	if not detail:
		frappe.throw("Not found", frappe.DoesNotExistError)
	if detail["project"] not in _visible_projects():
		frappe.throw("Not permitted", frappe.PermissionError)
	detail["deadline_human"] = _humanize_date(detail.get("latest_deadline"))
	detail["latest_deadline"] = str(detail["latest_deadline"]) if detail.get("latest_deadline") else None
	detail["project_deadline"] = str(detail["project_deadline"]) if detail.get("project_deadline") else None

	rows = [
		r
		for r in _fetch_todos([detail["project"]], include_cancelled=frappe.utils.cint(include_cancelled))
		if r["project_detail"] == project_detail
	]
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
	# Glossary options scoped to this project (name + label) and the detail's own selection.
	detail["glossary_options"] = frappe.get_all(
		"Glossary", filters={"project": detail["project"]},
		fields=["name", "glossary"], order_by="glossary asc", limit_page_length=0
	)
	detail["glossaries"] = frappe.get_all(
		"Project Glossary", filters={"parent": project_detail, "parentfield": "glossaries"},
		pluck="glossary", limit_page_length=0
	)

	# Resolve a default scoring Group from the detail's grouping (Glossary -> label -> Group).
	default_group = None
	if detail.get("grouping"):
		label = frappe.get_value("Glossary", detail["grouping"], "glossary")
		if label and frappe.db.exists("Group", label):
			default_group = label
	detail["default_group"] = default_group

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
	if not frappe.db.exists("Project Todo", project_item):
		frappe.throw("Not found", frappe.DoesNotExistError)
	# Authorize against the Project Todo's own read permission (System Manager or
	# project owner/leader/admin/team) so access matches what the todo lists show.
	# _visible_projects() is stricter (owner/team only, no System Manager exemption)
	# and would dead-end legitimately readable todos opened from cross-project
	# surfaces like the group detail screen.
	if not frappe.has_permission("Project Todo", "read", doc=project_item):
		frappe.throw("Not permitted", frappe.PermissionError)
	project_detail = frappe.get_value("Project Todo", project_item, "project_detail")
	if not project_detail:
		frappe.throw("Not found", frappe.DoesNotExistError)
	project = frappe.get_value("Project Detail", project_detail, "project")

	rows = [r for r in _fetch_todos([project], include_cancelled=True) if r["name"] == project_item]
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
			"cancellation_reason",
		],
		as_dict=True,
	) or {}
	shaped["cancellation_reason"] = extra.get("cancellation_reason")
	# Blocking links are Table MultiSelect child rows (mirror sides of one edge).
	shaped["blocked_by"] = frappe.get_all(
		"Project Todo Dependency",
		filters={"parent": project_item, "parentfield": "blocked_by"},
		pluck="todo",
	)
	shaped["blocking"] = frappe.get_all(
		"Project Todo Dependency",
		filters={"parent": project_item, "parentfield": "blocking"},
		pluck="todo",
	)
	# Sibling tasks in the same project detail (for the blocking pickers; excludes self).
	shaped["detail_todos"] = frappe.get_all(
		"Project Todo",
		filters={"project_detail": project_detail, "name": ["!=", project_item]},
		fields=["name", "to_do"],
		order_by="creation asc",
		limit_page_length=0,
	)
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
	leader_deadline=None,
	owner_deadline=None,
	estimated=None,
	assigned_to=None,
	group=None,
	level=None,
	is_recurring=None,
	recurring_frequency=None,
	recurring_until=None,
	estimated_planned_to_done=None,
	estimated_done_to_checked=None,
	estimated_checked_to_completed=None,
	blocked_by=None,
	blocking=None,
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
		# Optional phase deadlines: empty string clears them.
		if leader_deadline is not None:
			row.leader_deadline = leader_deadline or None
		if owner_deadline is not None:
			row.owner_deadline = owner_deadline or None
		if estimated is not None and estimated != "":
			row.estimated = int(estimated)
		if assigned_to is not None and assigned_to:
			row.assigned_to = assigned_to
		if group is not None and group:
			row.group = group
		if level is not None:
			row.level = level or None

		# Blocking links: arrays of todo names (JSON or list). Empty clears. The
		# controller mirrors the other side and rejects self-references.
		if blocked_by is not None:
			ids = [i for i in (frappe.parse_json(blocked_by) or []) if i != project_item]
			row.set("blocked_by", [{"todo": i} for i in ids])
		if blocking is not None:
			ids = [i for i in (frappe.parse_json(blocking) or []) if i != project_item]
			row.set("blocking", [{"todo": i} for i in ids])

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

		# Per-phase estimates in MINUTES (controller sums into total_estimated_hours).
		# planned_to_done is deprecated (covered by the main `estimated` field).
		for fld, val in (
			("estimated_done_to_checked", estimated_done_to_checked),
			("estimated_checked_to_completed", estimated_checked_to_completed),
		):
			if val is not None and val != "":
				row.set(fld, int(val))

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


def _load_todo_for_edit(project_item):
	"""Resolve a todo + its project and assert the caller may edit it.
	Returns (row_doc, project_doc). Raises a frappe error message dict via
	the caller on failure — here we return (None, error_dict)."""
	user = frappe.session.user
	if not frappe.db.exists("Project Todo", project_item):
		return None, {"status": "error", "message": "Task not found."}
	row = frappe.get_doc("Project Todo", project_item)
	project_detail = row.project_detail
	detail_project = frappe.get_value("Project Detail", project_detail, "project") if project_detail else None
	if not detail_project:
		return None, {"status": "error", "message": "Task not found."}
	project = frappe.get_doc("Project", detail_project)
	is_sm = "System Manager" in frappe.get_roles(user)
	if not (is_sm or user in (project.project_owner, project.project_leader, row.assigned_to)):
		return None, {"status": "error", "message": "You don't have permission to edit this task."}
	return row, project


@frappe.whitelist()
def cancel_todo(project_item, reason=None):
	"""Cancel a non-completed todo (reversible). Stores an optional reason."""
	row, ctx = _load_todo_for_edit(project_item)
	if row is None:
		return ctx
	if row.status == STATUS_COMPLETED:
		return {"status": "error", "message": "Cannot cancel a completed task."}
	if row.status == STATUS_CANCELLED:
		return {"status": "info", "message": "Task is already cancelled."}
	row.status = STATUS_CANCELLED
	row.cancellation_reason = (reason or "").strip() or None
	row.save(ignore_permissions=True)
	return {"status": "ok", "message": "Task cancelled."}


@frappe.whitelist()
def restore_todo(project_item):
	"""Restore a cancelled todo back to Planned and clear its reason."""
	row, ctx = _load_todo_for_edit(project_item)
	if row is None:
		return ctx
	if row.status != STATUS_CANCELLED:
		return {"status": "info", "message": "Task is not cancelled."}
	row.status = STATUS_PLANNED
	row.cancellation_reason = None
	row.save(ignore_permissions=True)
	return {"status": "ok", "message": "Task restored."}


@frappe.whitelist()
def set_todo_allocations(project_item, allocations):
	"""Assignee-only: replace a todo's day allocations (planning only, not scored).

	`allocations` is a JSON list of {date, minutes, note}. Returns the saved rows.
	"""
	try:
		user = frappe.session.user
		if not frappe.db.exists("Project Todo", project_item):
			return {"status": "error", "message": "Task not found."}
		assigned_to = frappe.get_value("Project Todo", project_item, "assigned_to")
		if user != assigned_to and "System Manager" not in frappe.get_roles(user):
			return {"status": "error", "message": "Only the assignee can edit day allocations."}

		if isinstance(allocations, str):
			allocations = json.loads(allocations or "[]")

		doc = frappe.get_doc("Project Todo", project_item)
		doc.set("allocations", [])
		alloc_sum = 0
		for a in allocations or []:
			d = a.get("date") or a.get("allocation_date")
			if not d:
				continue
			minutes = int(a.get("minutes") or a.get("estimated_minutes") or 0)
			alloc_sum += minutes
			doc.append("allocations", {
				"allocation_date": d,
				"estimated_minutes": minutes,
				"note": (a.get("note") or "").strip(),
			})
		# Daily split must add up to the task estimate (planning consistency).
		estimated = int(doc.estimated or 0)
		if estimated > 0 and alloc_sum != estimated:
			diff = estimated - alloc_sum
			short = f"{diff}m short of" if diff > 0 else f"{-diff}m over"
			return {"status": "error", "message": f"Daily split is {short} the {estimated}m estimate."}
		doc.save(ignore_permissions=True)
		frappe.db.commit()
		return {
			"status": "ok",
			"message": "Allocations saved.",
			"allocations": _allocations_map([project_item]).get(project_item, []),
		}
	except Exception as e:
		msg = frappe.utils.strip_html(str(e)).strip() or "Could not save allocations."
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
	"""Option lists for the project create/edit form (brands, users, groups).

	Uses ``frappe.get_all`` (no per-doctype read gate) so non-System-Manager
	project leads get the User list too — ``/api/resource/User`` is restricted
	to System Manager, which would 403 a raw resource list of users.
	"""
	brands = frappe.get_all("Brand", fields=["name", "brand_name"], limit_page_length=0)
	users = frappe.get_all(
		"User",
		filters={"enabled": 1, "name": ["not in", ("Guest",)]},
		fields=["name", "full_name"],
		limit_page_length=0,
	)
	return {
		"brands": sorted(
			[{"value": b["name"], "label": b.get("brand_name") or b["name"]} for b in brands],
			key=lambda x: x["label"],
		),
		"users": sorted(
			[{"value": u["name"], "label": u.get("full_name") or u["name"]} for u in users],
			key=lambda x: x["label"],
		),
	}


# --------------------------------------------------------------------------------
# User management (System Manager only)
# --------------------------------------------------------------------------------


@frappe.whitelist()
def list_users():
	"""All manageable users with their Vernon roles (System Manager only)."""
	_require_system_manager()
	users = frappe.get_all(
		"User",
		filters={"name": ["not in", PROTECTED_USERS]},
		fields=["name", "full_name", "enabled", "user_image", "last_active"],
		limit_page_length=0,
		order_by="full_name asc",
	)
	# Map user -> their Vernon roles in one query.
	role_rows = frappe.get_all(
		"Has Role",
		filters={"parenttype": "User", "role": ["in", VERNON_ROLES]},
		fields=["parent", "role"],
		limit_page_length=0,
	)
	roles_by_user = {}
	for r in role_rows:
		roles_by_user.setdefault(r["parent"], []).append(r["role"])
	for u in users:
		u["roles"] = sorted(roles_by_user.get(u["name"], []))
	return {"users": users}


def _clean_roles(roles):
	"""Parse the incoming roles list and keep only valid Vernon roles."""
	if isinstance(roles, str):
		roles = frappe.parse_json(roles) if roles else []
	return [r for r in (roles or []) if r in VERNON_ROLES]


@frappe.whitelist()
def create_user(email, full_name=None, roles=None, send_welcome=1):
	"""Create a User and assign Vernon roles (System Manager only)."""
	_require_system_manager()
	email = (email or "").strip().lower()
	if not email:
		frappe.throw("Email is required")
	if frappe.db.exists("User", email):
		frappe.throw("A user with this email already exists")

	wanted = _clean_roles(roles)
	doc = frappe.get_doc({
		"doctype": "User",
		"email": email,
		"first_name": (full_name or email).strip(),
		"enabled": 1,
		"send_welcome_email": 1 if frappe.utils.cint(send_welcome) else 0,
	})
	doc.insert(ignore_permissions=True)
	if wanted:
		doc.add_roles(*wanted)
	return {"name": doc.name}


@frappe.whitelist()
def update_user(user, full_name=None, roles=None, enabled=1):
	"""Edit name/enabled and sync the Vernon-role set (System Manager only)."""
	_require_system_manager()
	if user in PROTECTED_USERS:
		frappe.throw("This account cannot be modified here")
	enabled = 1 if frappe.utils.cint(enabled) else 0
	if enabled == 0 and user == frappe.session.user:
		frappe.throw("You cannot disable your own account")

	doc = frappe.get_doc("User", user)
	if full_name is not None:
		doc.full_name = full_name.strip()
		# first_name drives full_name for single-field names.
		doc.first_name = full_name.strip()
	doc.enabled = enabled
	doc.save(ignore_permissions=True)

	# Sync only the Vernon-role subset; leave System Manager etc. untouched.
	wanted = set(_clean_roles(roles))
	current = {
		r.role for r in doc.get("roles") if r.role in VERNON_ROLES
	}
	to_add = wanted - current
	to_remove = current - wanted
	if to_add:
		doc.add_roles(*to_add)
	if to_remove:
		doc.remove_roles(*to_remove)
	return {"name": doc.name}


@frappe.whitelist()
def reset_user_password(user):
	"""Send Frappe's reset-password email (System Manager only)."""
	_require_system_manager()
	if user in PROTECTED_USERS:
		frappe.throw("This account cannot be reset here")
	from frappe.core.doctype.user.user import reset_password
	result = reset_password(user)
	if result:
		# reset_password returns a sentinel string ("disabled"/"not allowed"/
		# "not found") when no email was sent; None on success.
		frappe.throw(f"Could not send reset email: {result}")
	return {"ok": True}


@frappe.whitelist()
def set_user_password(user, new_password):
	"""Directly set a user's password (System Manager only).

	Permanent until the user changes it. Enforces the site's password-strength
	policy, the same way frappe.core.doctype.user.user.update_password does.
	"""
	_require_system_manager()
	if user in PROTECTED_USERS:
		frappe.throw("This account cannot be modified here")
	if not new_password:
		frappe.throw("Password is required")

	from frappe.utils.password import update_password as _store_password
	from frappe.core.doctype.user.user import test_password_strength, handle_password_test_fail

	# Strength check — mirror core update_password (apps/frappe/.../user.py ~line 832-836).
	result = test_password_strength(new_password)
	feedback = result.get("feedback", None)
	if feedback and not feedback.get("password_policy_validation_passed", False):
		handle_password_test_fail(feedback)

	# Log the user out of other sessions when their password is reset under them.
	_store_password(user, new_password, logout_all_sessions=True)
	frappe.db.set_value("User", user, "last_password_reset_date", frappe.utils.today())
	return {"ok": True}


@frappe.whitelist()
def change_my_password(old_password, new_password):
	"""Logged-in user changes their OWN password (any authenticated user)."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	if not old_password or not new_password:
		frappe.throw("Both current and new password are required")

	from frappe.utils.password import check_password, update_password as _store_password
	from frappe.core.doctype.user.user import test_password_strength, handle_password_test_fail

	# Verify current password (raises AuthenticationError if wrong).
	try:
		check_password(user, old_password)
	except frappe.AuthenticationError:
		frappe.throw("Current password is incorrect")

	# Strength policy — same as set_user_password.
	result = test_password_strength(new_password)
	feedback = result.get("feedback", None)
	if feedback and not feedback.get("password_policy_validation_passed", False):
		handle_password_test_fail(feedback)

	_store_password(user, new_password, logout_all_sessions=True)
	frappe.db.set_value("User", user, "last_password_reset_date", frappe.utils.today())
	return {"ok": True}


# --------------------------------------------------------------------------------
# Badge — highest Badge Settings tier the user's lifetime Todo-source points clear.
# Metric matches the leaderboard: sum(Point Ledger.points_earned WHERE source='Todo').
# Grant/Gift credits never affect the badge.
# --------------------------------------------------------------------------------


def _badge_tiers():
	"""Configured tiers sorted by min_points desc. Cached for the request so the
	bootstrap/leaderboard/comment calls don't re-read the single each time."""
	cached = getattr(frappe.local, "_vernon_badge_tiers", None)
	if cached is not None:
		return cached
	tiers = []
	try:
		settings = frappe.get_cached_doc("Badge Settings")
		for t in settings.get("tiers") or []:
			tiers.append({
				"tier_name": t.tier_name,
				"min_points": float(t.min_points or 0),
				"color": t.color or None,
				"icon": t.icon or None,
			})
	except Exception:
		tiers = []
	tiers.sort(key=lambda t: t["min_points"], reverse=True)
	frappe.local._vernon_badge_tiers = tiers
	return tiers


def _user_badge(user):
	"""Return {tier_name, color, icon} for the highest tier the user clears, or None.
	earned = lifetime Todo-source points (Grant/Gift excluded, matching the leaderboard)."""
	tiers = _badge_tiers()
	if not tiers:
		return None
	earned = float(frappe.db.sql(
		"select coalesce(sum(points_earned), 0) from `tabPoint Ledger` "
		"where user = %s and coalesce(source, 'Todo') not in ('Grant', 'Gift')",
		user,
	)[0][0])
	for t in tiers:  # already sorted desc by min_points
		if earned >= t["min_points"]:
			return {"tier_name": t["tier_name"], "color": t["color"], "icon": t["icon"]}
	return None


@frappe.whitelist()
def get_badge_settings():
	"""All configured badge tiers for the admin editor (System Manager only).
	Returned ascending by min_points — the order they read naturally in the form."""
	_require_system_manager()
	settings = frappe.get_single("Badge Settings")
	tiers = [
		{
			"tier_name": t.tier_name,
			"min_points": float(t.min_points or 0),
			"color": t.color or "",
			"icon": t.icon or "",
		}
		for t in (settings.get("tiers") or [])
	]
	tiers.sort(key=lambda t: t["min_points"])
	return {"tiers": tiers}


@frappe.whitelist()
def save_badge_settings(tiers):
	"""Replace the badge tier table (System Manager only). `tiers` is a JSON list
	of {tier_name, min_points, color?, icon?}."""
	_require_system_manager()
	if isinstance(tiers, str):
		tiers = frappe.parse_json(tiers) if tiers else []
	rows = []
	for t in tiers or []:
		name = (t.get("tier_name") or "").strip()
		if not name:
			frappe.throw("Each tier needs a name")
		rows.append({
			"tier_name": name,
			"min_points": float(t.get("min_points") or 0),
			"color": (t.get("color") or "").strip(),
			"icon": (t.get("icon") or "").strip(),
		})
	settings = frappe.get_single("Badge Settings")
	settings.set("tiers", rows)
	settings.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}


# --------------------------------------------------------------------------------
# Points wallet — balance, transaction log
# Balance is computed live: sum(Point Ledger credits) - sum(Reward Redemption debits).
# Nothing is materialized, so there is no balance to drift out of sync.
# --------------------------------------------------------------------------------


def _user_balance(user):
	"""Return (earned, redeemed, balance) for a user as floats."""
	earned = frappe.db.sql(
		"select coalesce(sum(points_earned), 0) from `tabPoint Ledger` where user = %s",
		user,
	)[0][0]
	redeemed = frappe.db.sql(
		"select coalesce(sum(point_cost), 0) from `tabReward Redemption` where user = %s",
		user,
	)[0][0]
	earned, redeemed = float(earned), float(redeemed)
	return earned, redeemed, earned - redeemed


@frappe.whitelist()
def get_wallet():
	"""Spendable-points summary for the logged-in user, including today's and yesterday's earned points."""
	user = frappe.session.user
	earned, redeemed, balance = _user_balance(user)
	today = nowdate()
	yesterday = add_days(today, -1)
	def _earned_on(day):
		return float(frappe.db.sql(
			"select coalesce(sum(points_earned), 0) from `tabPoint Ledger` "
			"where user=%s and date(credited_on)=%s "
			"and coalesce(source, 'Todo') not in ('Grant', 'Gift')",
			(user, day),
		)[0][0])
	return {
		"earned": earned, "redeemed": redeemed, "balance": balance,
		"today_earned": _earned_on(today), "yesterday_earned": _earned_on(yesterday),
	}


@frappe.whitelist()
def get_wallet_log():
	"""Unified credit/debit timeline (latest 100), newest first, with a running
	balance-after-transaction attached to each row."""
	user = frappe.session.user

	credits = frappe.get_all(
		"Point Ledger",
		filters={"user": user},
		fields=["points_earned as amount", "todo", "group", "role", "source", "note", "granted_by", "credited_on as date"],
		order_by="credited_on desc",
		limit=100,
	)
	debits = frappe.get_all(
		"Reward Redemption",
		filters={"user": user},
		fields=["point_cost", "reward_name", "status", "redeemed_on as date"],
		order_by="redeemed_on desc",
		limit=100,
	)

	# Resolve todo subjects for credit titles in one query.
	todo_ids = [c["todo"] for c in credits if c.get("todo")]
	subj = {}
	if todo_ids:
		for r in frappe.get_all(
			"Project Todo", filters={"name": ["in", todo_ids]}, fields=["name", "to_do"]
		):
			subj[r["name"]] = r["to_do"]

	# Resolve gift counterpart (granted_by) display names in one query.
	gift_user_ids = list({c["granted_by"] for c in credits if c.get("source") == "Gift" and c.get("granted_by")})
	gift_names = {}
	if gift_user_ids:
		for r in frappe.get_all(
			"User", filters={"name": ["in", gift_user_ids]}, fields=["name", "full_name"]
		):
			gift_names[r["name"]] = r["full_name"]

	rows = []
	for c in credits:
		src = c.get("source")
		amt = float(c["amount"] or 0)
		if src == "Gift":
			counterpart = gift_names.get(c.get("granted_by")) or c.get("granted_by") or "someone"
			rows.append(
				{
					"kind": "debit" if amt < 0 else "credit",
					"amount": amt,
					"title": "Gift sent" if amt < 0 else "Gift received",
					"subtitle": (f"to {counterpart}" if amt < 0 else f"from {counterpart}"),
					"status": None,
					"date": str(c["date"]) if c.get("date") else None,
					"date_human": _humanize_datetime(c.get("date")),
				}
			)
			continue
		is_grant = (src == "Grant")
		rows.append(
			{
				"kind": "credit",
				"amount": amt,
				"title": "Points granted" if is_grant else (subj.get(c.get("todo")) or "Points earned"),
				"subtitle": (c.get("note") or "Granted") if is_grant else (c.get("group") or (c.get("role") and f"{c['role']} reward")),
				"status": None,
				"date": str(c["date"]) if c.get("date") else None,
				"date_human": _humanize_datetime(c.get("date")),
			}
		)
	for d in debits:
		rows.append(
			{
				"kind": "debit",
				"amount": -float(d["point_cost"] or 0),
				"title": d.get("reward_name") or "Redemption",
				"subtitle": "Marketplace",
				"status": d.get("status"),
				"date": str(d["date"]) if d.get("date") else None,
				"date_human": _humanize_datetime(d.get("date")),
			}
		)

	# Sort merged newest-first; rows with no date sink to the bottom.
	rows.sort(key=lambda r: r["date"] or "", reverse=True)
	rows = rows[:100]

	# Running balance walks newest -> oldest from the current total.
	_, _, running = _user_balance(user)
	for r in rows:
		r["balance"] = round(running, 2)
		running -= r["amount"]

	return rows


# --------------------------------------------------------------------------------
# Leaderboard — rank users by points EARNED in a period, optionally by brand.
# Spending never lowers rank (we sum Point Ledger only, not redemptions).
# --------------------------------------------------------------------------------


def _period_start(period):
	"""Return the inclusive start date for a period, or None for all-time."""
	from frappe.utils import get_first_day, get_first_day_of_week

	if period == "weekly":
		return get_first_day_of_week(nowdate())
	if period == "monthly":
		return get_first_day(getdate(nowdate()))
	return None


@frappe.whitelist()
def get_leaderboard(period="monthly", brand=None):
	"""Top 50 users by points earned in the period; plus the caller's own rank."""
	if period not in ("weekly", "monthly", "all"):
		period = "monthly"
	brand = brand or None

	start = _period_start(period)
	conds = []
	params = {}
	join = ""
	conds.append("coalesce(pl.source, 'Todo') not in ('Grant', 'Gift')")
	if start is not None:
		conds.append("pl.credited_on >= %(start)s")
		params["start"] = start
	if brand:
		join = "join `tabProject` p on p.name = pl.project"
		conds.append("p.brand = %(brand)s")
		params["brand"] = brand

	where = ("where " + " and ".join(conds)) if conds else ""
	sql = f"""
		select pl.user as user, coalesce(sum(pl.points_earned), 0) as points
		from `tabPoint Ledger` pl
		{join}
		{where}
		group by pl.user
		having points <> 0
		order by points desc, pl.user asc
	"""
	ranked = frappe.db.sql(sql, params, as_dict=True)

	name_map = _user_name_map([r["user"] for r in ranked])

	def shape(row, rank):
		info = name_map.get(row["user"], {})
		return {
			"user": row["user"],
			"full_name": info.get("full_name") or row["user"],
			"image": info.get("user_image"),
			"points": float(row["points"]),
			"rank": rank,
		}

	entries, me = [], None
	caller = frappe.session.user
	for i, row in enumerate(ranked):
		shaped = shape(row, i + 1)
		if i < 50:
			entries.append(shaped)
		if row["user"] == caller:
			me = shaped

	brands = [b["brand_name"] for b in frappe.get_all("Brand", fields=["brand_name"], order_by="brand_name asc")]

	return {"period": period, "brand": brand, "brands": brands, "entries": entries, "me": me}


# --------------------------------------------------------------------------------
# Marketplace — browse active rewards and redeem (instant deduct).
# --------------------------------------------------------------------------------


@frappe.whitelist()
def get_marketplace():
	"""Active catalog + the caller's spendable balance."""
	_, _, balance = _user_balance(frappe.session.user)
	rewards = frappe.get_all(
		"Marketplace Reward",
		filters={"active": 1},
		fields=["name", "reward_name", "point_cost", "image", "description", "stock_quantity"],
		order_by="point_cost asc, reward_name asc",
	)
	for r in rewards:
		r["point_cost"] = float(r["point_cost"] or 0)
	return {"balance": balance, "rewards": rewards}


@frappe.whitelist()
def redeem_reward(reward):
	"""Instant-deduct redemption. Re-checks active + stock + balance inside the
	transaction (row-locked) so concurrent redeems cannot oversell or push a
	balance negative."""
	user = frappe.session.user
	lock_key = f"vernon_redeem:{user}"
	# Serialize a single user's redeems so two concurrent requests can't both
	# pass the balance check and drive the balance negative. Connection-scoped;
	# released in finally. 10s timeout -> treat contention as a transient busy.
	got = frappe.db.sql("select get_lock(%s, 10)", lock_key)[0][0]
	if not got:
		frappe.throw("Redemption busy, please retry", frappe.ValidationError)
	try:
		# Lock the catalog row for the duration of the transaction.
		row = frappe.db.sql(
			"""select name, reward_name, point_cost, stock_quantity, active
			from `tabMarketplace Reward` where name = %s for update""",
			reward,
			as_dict=True,
		)
		if not row:
			frappe.throw("Reward unavailable", frappe.ValidationError)
		r = row[0]
		if not r["active"]:
			frappe.throw("Reward unavailable", frappe.ValidationError)
		if (r["stock_quantity"] or 0) <= 0:
			frappe.throw("Out of stock", frappe.ValidationError)

		cost = float(r["point_cost"] or 0)
		_, _, balance = _user_balance(user)
		if cost > balance:
			frappe.throw("Insufficient balance", frappe.ValidationError)

		redemption = frappe.get_doc(
			{
				"doctype": "Reward Redemption",
				"user": user,
				"reward": r["name"],
				"reward_name": r["reward_name"],
				"point_cost": cost,
				"status": "Pending",
				"redeemed_on": now_datetime(),
			}
		)
		redemption.insert(ignore_permissions=True)

		frappe.db.set_value(
			"Marketplace Reward", r["name"], "stock_quantity", (r["stock_quantity"] or 0) - 1
		)

		_, _, new_balance = _user_balance(user)
		return {"balance": new_balance, "redemption": redemption.name}
	finally:
		frappe.db.sql("select release_lock(%s)", lock_key)


# --------------------------------------------------------------------------------
# Marketplace administration — catalog CRUD rides /api/resource; these endpoints
# cover what resource access can't: server-resolved redemption listing and
# role-gated image upload. Admin = Marketplace Manager or System Manager.
# --------------------------------------------------------------------------------


def _require_marketplace_manager():
	roles = frappe.get_roles(frappe.session.user)
	if "System Manager" not in roles and "Marketplace Manager" not in roles:
		frappe.throw("Not permitted", frappe.PermissionError)


@frappe.whitelist()
def list_redemptions(status="all"):
	"""Redemptions with user full names resolved server-side, newest first.
	status in {"pending", "fulfilled", "all"}."""
	_require_marketplace_manager()

	filters = {}
	if status == "pending":
		filters["status"] = "Pending"
	elif status == "fulfilled":
		filters["status"] = "Fulfilled"

	rows = frappe.get_all(
		"Reward Redemption",
		filters=filters,
		fields=[
			"name", "user", "reward_name", "point_cost", "status",
			"redeemed_on", "fulfilled_on",
		],
		order_by="redeemed_on desc",
		limit=200,
	)
	name_map = _user_name_map([r["user"] for r in rows])
	for r in rows:
		info = name_map.get(r["user"], {})
		r["user_name"] = info.get("full_name") or r["user"]
		r["point_cost"] = float(r["point_cost"] or 0)
		r["redeemed_on_human"] = _humanize_datetime(r.get("redeemed_on"))
		r["redeemed_on"] = str(r["redeemed_on"]) if r.get("redeemed_on") else None
		r["fulfilled_on"] = str(r["fulfilled_on"]) if r.get("fulfilled_on") else None
	return rows


ALLOWED_IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif")
ALLOWED_IMAGE_MIME = ("image/png", "image/jpeg", "image/webp", "image/gif")
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@frappe.whitelist()
def upload_reward_image():
	"""Save an uploaded reward image as a public File and return its URL. The
	form then stores the URL on the reward's `image` field like any other field.

	Only raster image types are accepted: the file is served public, so SVG/HTML
	(stored-XSS vectors) and other content are rejected by extension and MIME."""
	_require_marketplace_manager()
	import os
	from frappe.utils.file_manager import save_file

	f = frappe.request.files.get("file")
	if not f:
		frappe.throw("No file uploaded")

	ext = os.path.splitext(f.filename or "")[1].lower()
	if ext not in ALLOWED_IMAGE_EXT:
		frappe.throw("Unsupported image type. Use PNG, JPG, WEBP, or GIF.")
	mimetype = (getattr(f, "mimetype", "") or "").lower()
	if mimetype and mimetype not in ALLOWED_IMAGE_MIME:
		frappe.throw("Unsupported image type. Use PNG, JPG, WEBP, or GIF.")

	content = f.stream.read()
	if len(content) > MAX_IMAGE_BYTES:
		frappe.throw("Image too large (max 5 MB).")

	saved = save_file(f.filename, content, None, None, is_private=0)
	return {"file_url": saved.file_url}


# --------------------------------------------------------------------------------
# Grant Points — manual wallet credit by an authorized grantor.
# Granted points raise the recipient's spendable balance but are excluded from
# the leaderboard (source='Grant'). Grantor = Points Granter or System Manager.
# --------------------------------------------------------------------------------


def _require_points_granter():
	roles = frappe.get_roles(frappe.session.user)
	if "System Manager" not in roles and "Points Granter" not in roles:
		frappe.throw("Not permitted", frappe.PermissionError)


# Manual grants aren't tied to a real work group, so they're attributed to a
# dedicated "Extra" group. This makes grants show a group in the wallet log and
# group-based reporting alongside earned points.
GRANT_GROUP = "Extra"


def _ensure_grant_group():
	"""Create the 'Extra' grant group on first use. Idempotent."""
	if not frappe.db.exists("Group", GRANT_GROUP):
		frappe.get_doc({
			"doctype": "Group",
			"group_name": GRANT_GROUP,
			"description": "Manual point grants (not tied to a work group).",
		}).insert(ignore_permissions=True)
	return GRANT_GROUP


@frappe.whitelist()
def grant_points(user, amount, note=None):
	"""Manually credit points to a user's wallet. Positive amounts only."""
	_require_points_granter()
	user = (user or "").strip()
	if not user or user in PROTECTED_USERS or not frappe.db.exists("User", user):
		frappe.throw("Unknown user")
	if not frappe.db.get_value("User", user, "enabled"):
		frappe.throw("User is disabled")
	try:
		amount = float(amount)
	except (TypeError, ValueError):
		frappe.throw("Amount must be a number")
	if amount <= 0:
		frappe.throw("Amount must be greater than zero")

	frappe.get_doc({
		"doctype": "Point Ledger",
		"user": user,
		"group": _ensure_grant_group(),
		"points_earned": amount,
		"point": amount,
		"source": "Grant",
		"note": (note or "").strip() or None,
		"granted_by": frappe.session.user,
		"credited_on": frappe.utils.now(),
	}).insert(ignore_permissions=True)
	frappe.db.commit()

	_, _, balance = _user_balance(user)
	return {"balance": balance, "granted": amount}


@frappe.whitelist()
def list_grant_users():
	"""Lightweight enabled-user list for the grant picker."""
	_require_points_granter()
	users = frappe.get_all(
		"User",
		filters={"name": ["not in", PROTECTED_USERS], "enabled": 1},
		fields=["name", "full_name", "user_image"],
		limit_page_length=0,
		order_by="full_name asc",
	)
	return {"users": users}


@frappe.whitelist()
def gift_points(to_user, amount, note=None):
	"""Transfer points from the logged-in user to another user. Zero-sum:
	the sender is debited (negative ledger row), the recipient credited.
	Whole numbers only. Excluded from leaderboard rank."""
	sender = frappe.session.user
	to_user = (to_user or "").strip()
	if not to_user or to_user in PROTECTED_USERS or not frappe.db.exists("User", to_user):
		frappe.throw("Unknown user")
	if to_user == sender:
		frappe.throw("Cannot gift yourself")
	if not frappe.db.get_value("User", to_user, "enabled"):
		frappe.throw("User is disabled")
	try:
		amount = float(amount)
	except (TypeError, ValueError):
		frappe.throw("Amount must be a whole number greater than zero")
	if amount <= 0 or amount != int(amount):
		frappe.throw("Amount must be a whole number greater than zero")
	amount = int(amount)

	_, _, balance = _user_balance(sender)
	if balance < amount:
		frappe.throw("Not enough points")

	note = (note or "").strip() or None
	now = frappe.utils.now()
	# Recipient credit
	frappe.get_doc({
		"doctype": "Point Ledger",
		"user": to_user,
		"points_earned": amount,
		"point": amount,
		"source": "Gift",
		"granted_by": sender,
		"note": note,
		"credited_on": now,
	}).insert(ignore_permissions=True)
	# Sender debit (negative row reduces sender balance via the sum formula)
	frappe.get_doc({
		"doctype": "Point Ledger",
		"user": sender,
		"points_earned": -amount,
		"point": amount,
		"source": "Gift",
		"granted_by": to_user,
		"note": note,
		"credited_on": now,
	}).insert(ignore_permissions=True)
	frappe.db.commit()

	_, _, new_balance = _user_balance(sender)
	return {"balance": new_balance, "gifted": amount, "to": to_user}


@frappe.whitelist()
def list_gift_recipients():
	"""Enabled users (minus protected users and the caller) for the gift
	picker. Open to every logged-in user (unlike list_grant_users)."""
	users = frappe.get_all(
		"User",
		filters={
			"name": ["not in", list(PROTECTED_USERS) + [frappe.session.user]],
			"enabled": 1,
		},
		fields=["name", "full_name", "user_image"],
		limit_page_length=0,
		order_by="full_name asc",
	)
	return {"users": users}
