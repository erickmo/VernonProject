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
from frappe.utils import getdate, nowdate, pretty_date, get_datetime, date_diff, now_datetime, add_days, cint
from vernon_project.vernon_project.doctype.employee_profile.employee_profile import _ensure_employee_profile
from vernon_project.attendance.leave_quota import effective_quota, prior_taken, used_including_prior

# --------------------------------------------------------------------------------
# Status workflow constants
# Must match the option strings stored in `tabProject Todo`.`status` exactly
# (note the U+FE0F variation selector after the white-circle in "Planned").
# --------------------------------------------------------------------------------
VERNON_ROLES = ("Project Owner", "Project Leader", "Project Admin", "Project Team", "Points Granter")
PROTECTED_USERS = ("Guest", "Administrator")
# Member-type marking on User (custom_member_type). "" = external/unset.
MEMBER_TYPES = ("", "Internal Team", "Intern")

# Employee Profile self-editable soft fields (mobile /m). Legal/contract/quota are NOT here.
EMPLOYEE_SOFT_FIELDS = (
	"home_address", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
)
EMPLOYEE_SOFT_CHILDREN = {
	"education": ("level", "institution", "major", "year"),
	"skills": ("skill", "proficiency"),
	"trainings": ("title", "provider", "training_date", "certificate", "expiry_date"),
}
# Native User fields reused instead of duplicating on Employee Profile.
EMPLOYEE_USER_FIELDS = ("phone", "birth_date", "bio")


def _leave_balance(user):
	yr = getdate(nowdate()).year
	quota = effective_quota(user)
	used = used_including_prior(user, yr)
	return {"quota": quota, "used": used, "remaining": quota - used, "prior": prior_taken(user)}


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


def _pct_minutes(m_done, m_total, c_done, c_total):
	"""Minutes-based progress %, falling back to todo count when nothing is estimated."""
	if m_total:
		return round(m_done / m_total * 100)
	return round(c_done / c_total * 100) if c_total else 0


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


def _can_reject(status_key, project, user):
	"""Mirror vernon_project.api.project_todo.reject_status. Reject is offered
	only at the review stages (done -> awaiting leader, checked -> awaiting
	owner); Owner or Leader may reject; Admin never."""
	owner = project.get("project_owner")
	leader = project.get("project_leader")
	admin = project.get("project_admin")

	if admin and user == admin:
		return False
	if status_key in ("done", "checked"):
		return user in (owner, leader)
	return False


def _avatar_config_map(users):
	"""Map user -> parsed DiceBear avatar config (or None). Batch-reads User Avatar.config_json."""
	out = {}
	if not users:
		return out
	for row in frappe.get_all("User Avatar", filters={"user": ["in", list(set(users))]}, fields=["user", "config_json"]):
		try:
			out[row["user"]] = frappe.parse_json(row["config_json"]) if row.get("config_json") else None
		except Exception:
			out[row["user"]] = None
	return out


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
	result = {r["name"]: r for r in rows}
	# Attach avatar_config to every entry so callers never need a second map.
	avatar_map = _avatar_config_map(list(result.keys()))
	for email, entry in result.items():
		entry["avatar_config"] = avatar_map.get(email)
	return result


def _push_to_subscriptions(recipient, payload):
	"""Best-effort Web Push to every Push Subscription of `recipient`.
	Dead endpoints (404/410) are deleted. Never raises."""
	public_key = frappe.conf.get("vapid_public_key")
	private_key = frappe.conf.get("vapid_private_key")
	subject = frappe.conf.get("vapid_subject")
	if not (public_key and private_key and subject):
		return  # VAPID not configured yet (see deploy prerequisite)

	try:
		from pywebpush import webpush, WebPushException
	except Exception:
		return  # pywebpush not installed yet

	subs = frappe.get_all(
		"Push Subscription",
		filters={"user": recipient},
		fields=["name", "endpoint", "p256dh", "auth"],
		limit_page_length=0,
	)
	for sub in subs:
		try:
			webpush(
				subscription_info={
					"endpoint": sub["endpoint"],
					"keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
				},
				data=json.dumps(payload),
				vapid_private_key=private_key,
				vapid_claims={"sub": subject},
			)
		except WebPushException as e:
			status = getattr(getattr(e, "response", None), "status_code", None)
			if status in (404, 410):
				frappe.delete_doc(
					"Push Subscription", sub["name"], ignore_permissions=True, force=True
				)
		except Exception:
			pass  # network / encoding error — drop this push, keep the loop alive


def _notify(recipient, type, title, body, reference_doctype=None, reference_name=None, actor=None):
	"""Insert an in-app Vernon Notification and send Web Push. Best-effort:
	any failure is swallowed so the triggering mutation never breaks. Skips
	self-notification (recipient == actor)."""
	try:
		if not recipient or recipient in PROTECTED_USERS:
			return
		if actor and recipient == actor:
			return
		frappe.get_doc({
			"doctype": "Vernon Notification",
			"recipient": recipient,
			"type": type,
			"title": title,
			"body": body,
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			"actor": actor,
			"is_read": 0,
		}).insert(ignore_permissions=True)
		frappe.db.commit()
		_push_to_subscriptions(
			recipient,
			{
				"title": title,
				"body": body,
				"reference_doctype": reference_doctype,
				"reference_name": reference_name,
			},
		)
	except Exception:
		frappe.log_error(title="_notify failed")


@frappe.whitelist()
def get_notifications(limit=30):
	"""Newest-first notifications for the session user + unread count."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	limit = frappe.utils.cint(limit) or 30
	rows = frappe.get_all(
		"Vernon Notification",
		filters={"recipient": user},
		fields=[
			"name", "type", "title", "body", "reference_doctype",
			"reference_name", "actor", "is_read", "creation",
		],
		order_by="creation desc",
		limit_page_length=limit,
	)
	actor_map = _user_name_map({r["actor"] for r in rows})
	items = [
		{
			"name": r["name"],
			"type": r["type"],
			"title": r["title"],
			"body": r["body"],
			"reference_doctype": r["reference_doctype"],
			"reference_name": r["reference_name"],
			"actor": r["actor"],
			"actor_name": (actor_map.get(r["actor"]) or {}).get("full_name") or r["actor"],
			"is_read": bool(r["is_read"]),
			"at": str(r["creation"]),
			"at_human": _humanize_datetime(r["creation"]),
		}
		for r in rows
	]
	unread = frappe.db.count("Vernon Notification", {"recipient": user, "is_read": 0})
	return {"items": items, "unread": unread}


@frappe.whitelist()
def mark_notification_read(name):
	"""Mark one of the session user's notifications read."""
	user = frappe.session.user
	owner = frappe.db.get_value("Vernon Notification", name, "recipient")
	if owner != user:
		frappe.throw("Not permitted", frappe.PermissionError)
	frappe.db.set_value("Vernon Notification", name, "is_read", 1, update_modified=False)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
def mark_all_read():
	"""Mark every unread notification of the session user as read."""
	user = frappe.session.user
	names = frappe.get_all(
		"Vernon Notification",
		filters={"recipient": user, "is_read": 0},
		pluck="name",
		limit_page_length=0,
	)
	for n in names:
		frappe.db.set_value("Vernon Notification", n, "is_read", 1, update_modified=False)
	frappe.db.commit()
	return {"ok": True, "marked": len(names)}


@frappe.whitelist()
def register_push_subscription(subscription):
	"""Upsert a Push Subscription (by endpoint) for the session user."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	sub = frappe.parse_json(subscription) if isinstance(subscription, str) else subscription
	endpoint = (sub or {}).get("endpoint")
	keys = (sub or {}).get("keys") or {}
	p256dh = keys.get("p256dh")
	auth = keys.get("auth")
	if not endpoint or not p256dh or not auth:
		frappe.throw("Invalid subscription")
	ua = frappe.local.request.headers.get("User-Agent") if frappe.local.request else None
	existing = frappe.db.get_value("Push Subscription", {"endpoint": endpoint}, "name")
	if existing:
		doc = frappe.get_doc("Push Subscription", existing)
		doc.user = user
		doc.p256dh = p256dh
		doc.auth = auth
		doc.user_agent = (ua or "")[:500]
		doc.save(ignore_permissions=True)
	else:
		frappe.get_doc({
			"doctype": "Push Subscription",
			"user": user,
			"endpoint": endpoint,
			"p256dh": p256dh,
			"auth": auth,
			"user_agent": (ua or "")[:500],
		}).insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
def unregister_push_subscription(endpoint):
	"""Delete the session user's Push Subscription by endpoint."""
	user = frappe.session.user
	name = frappe.db.get_value(
		"Push Subscription", {"endpoint": endpoint, "user": user}, "name"
	)
	if name:
		frappe.delete_doc("Push Subscription", name, ignore_permissions=True, force=True)
		frappe.db.commit()
	return {"ok": True}


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
			t.name, t.to_do, t.status, t.start_date, t.deadline, t.leader_deadline, t.owner_deadline,
			t.estimated, t.assigned_to,
			t.is_waiting, t.waiting_reason, t.waiting_since, t.waiting_by,
			t.ongoing, t.notes, t.is_recurring,
			t.`group` AS `group`, t.level, t.level_id, t.level_type, t.point, t.assignee_earned, t.leader_earned,
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
			"overdue": bool(dl and skey != "completed" and not r.get("is_waiting") and getdate(dl) < getdate(nowdate())),
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
	can_reject = _can_reject(skey, project, user)
	overdue = bool(
		row["deadline"]
		and skey != "completed"
		and not row.get("is_waiting")
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
		"can_reject": can_reject,
		"start_date": str(row["start_date"]) if row.get("start_date") else None,
		"start_date_human": _humanize_date(row.get("start_date")),
		"deadline": str(row["deadline"]) if row["deadline"] else None,
		"deadline_human": _humanize_date(row["deadline"]),
		"is_overdue": overdue,
		"is_waiting": bool(row.get("is_waiting")),
		"waiting_reason": row.get("waiting_reason") or None,
		"waiting_since": str(row["waiting_since"]) if row.get("waiting_since") else None,
		"waiting_by_name": (name_map.get(row.get("waiting_by"), {}) or {}).get("full_name") or row.get("waiting_by"),
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
		"assigned_to_avatar_config": assignee.get("avatar_config"),
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
		"level_id": row.get("level_id"),
		"level_type": row.get("level_type"),
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
		"estimated": row["estimated"] or 0,
		"deadline": str(row["deadline"]) if row["deadline"] else None,
		"deadline_human": _humanize_date(row["deadline"]),
		"is_overdue": bool(
			row["deadline"] and skey != "completed"
			and not row.get("is_waiting")
			and getdate(row["deadline"]) < getdate(nowdate())
		),
		"is_waiting": bool(row.get("is_waiting")),
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
	av_cfg = frappe.db.get_value("User Avatar", user, "config_json")
	ep = _ensure_employee_profile(user)
	uf = frappe.get_value("User", user, ["phone", "birth_date", "bio"], as_dict=True) or {}
	employee = {f: ep.get(f) for f in EMPLOYEE_SOFT_FIELDS}
	employee["phone"] = uf.get("phone")
	employee["birthdate"] = uf.get("birth_date")
	employee["bio"] = uf.get("bio")
	employee["education"] = [r.as_dict() for r in ep.education]
	employee["skills"] = [r.as_dict() for r in ep.skills]
	employee["trainings"] = [r.as_dict() for r in ep.trainings]
	return {
		"user": user,
		"full_name": u.get("full_name") or user,
		"image": u.get("user_image"),
		"avatar_config": (frappe.parse_json(av_cfg) if av_cfg else None),
		"roles": vernon_roles,
		"is_leader": any(r in roles for r in ("Project Owner", "Project Leader", "System Manager")),
		"badge": _user_badge(user),
		"vapid_public_key": frappe.conf.get("vapid_public_key") or None,
		"employee": employee,
		"leave": _leave_balance(user),
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

	completed_today = 0
	completed_minutes_today = 0
	for r in rows:
		if (
			r["assigned_to"] == user
			and r["completed_at"]
			and str(r["completed_at"])[:10] == str(today)
		):
			completed_today += 1
			completed_minutes_today += r["estimated"] or 0

	return {
		"counts": {
			"overdue": len(overdue),
			"due_today": len(due_today),
			"upcoming": len(upcoming),
			"review": len(review),
			"completed_today": completed_today,
			"completed_minutes_today": completed_minutes_today,
		},
		"overdue": overdue,
		"due_today": due_today,
		"upcoming": upcoming,
		"review": review,
	}


@frappe.whitelist()
def get_calendar():
	"""All visible todos, shaped, for the Calendar view.

	Returns the per-user visible set in one round-trip; the client buckets them
	onto calendar days and applies scope / date-field / split-schedule toggles.
	Shapes include deadline, owner_deadline, leader_deadline and per-day
	allocations (the assignee's day-plan that drives "split schedule").
	"""
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
	assigned_map = _assigned_allocations_map([r["name"] for r in rows])

	todos = []
	for r in rows:
		shaped = _shape_todo(r, user, name_map, alloc_map=alloc_map)
		# Leader's authoritative per-day split (falls back to the whole estimate on
		# the deadline). Drives the calendar's "Assigned" mode; mirrors get_project_item.
		_asg = assigned_map.get(r["name"], [])
		shaped["assigned_allocation"] = _assigned_allocation_for(
			_asg, shaped.get("deadline"), shaped.get("estimated") or 0
		)
		shaped["assigned_total"] = sum((a["minutes"] or 0) for a in shaped["assigned_allocation"])
		todos.append(shaped)
	return {"todos": todos}


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

	stats = {n: {"total": 0, "done": 0, "overdue": 0, "review": 0, "minutes_total": 0, "minutes_done": 0} for n in names}
	for r in rows:
		s = stats[r["project"]]
		s["total"] += 1
		est = r["estimated"] or 0
		s["minutes_total"] += est
		skey = _status_key(r["status"])
		if skey == "completed":
			s["done"] += 1
			s["minutes_done"] += est
		else:
			if r["deadline"] and not r.get("is_waiting") and getdate(r["deadline"]) < today:
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
		p["minutes_total"] = s["minutes_total"]
		p["minutes_done"] = s["minutes_done"]
		p["progress"] = _pct_minutes(s["minutes_done"], s["minutes_total"], s["done"], s["total"])
		p["start_date"] = str(p["start_date"]) if p["start_date"] else None
		p["deadline"] = str(p["deadline"]) if p["deadline"] else None
		owner_nm = name_map.get(p["project_owner"]) or {}
		leader_nm = name_map.get(p["project_leader"]) or {}
		p["owner_name"] = owner_nm.get("full_name") or p["project_owner"]
		p["leader_name"] = leader_nm.get("full_name") or p["project_leader"]
		# Owner/leader real avatar so the card renders their actual avatar, not a
		# name-seeded placeholder.
		p["owner_image"] = owner_nm.get("user_image")
		p["owner_avatar_config"] = owner_nm.get("avatar_config")
		p["leader_image"] = leader_nm.get("user_image")
		p["leader_avatar_config"] = leader_nm.get("avatar_config")
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
			"minutes_total": 0,
			"minutes_done": 0,
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
			{"name": r["project_detail"], "title": r["project_detail_title"], "total": 0, "done": 0, "overdue": 0, "minutes_total": 0, "minutes_done": 0},
		)
		wi["total"] += 1
		est = r["estimated"] or 0
		wi["minutes_total"] += est
		skey = _status_key(r["status"])
		if skey == "completed":
			wi["done"] += 1
			wi["minutes_done"] += est
		elif r["deadline"] and not r.get("is_waiting") and getdate(r["deadline"]) < today:
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
		wi["progress"] = _pct_minutes(wi["minutes_done"], wi["minutes_total"], wi["done"], wi["total"])

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
			"avatar_config": (name_map.get(email) or {}).get("avatar_config"),
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
		"by_avatar_config": person.get("avatar_config"),
		"by_badge": _user_badge(by) if by else None,
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


import re

_MENTION_RE = re.compile(r'data-mention\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)


def _parse_mentions(content):
	"""Extract the set of user emails marked up as
	<span data-mention="user@email">@Name</span> in comment HTML."""
	if not content:
		return set()
	return {m.strip() for m in _MENTION_RE.findall(content) if m.strip()}


def _comment_participants(reference_doctype, reference_name):
	"""Users to notify of a new comment on this record: project owner/leader/admin
	and (for a Project Todo target) the todo's assignee."""
	project = _comment_project(reference_doctype, reference_name)
	people = set()
	if project:
		owner, leader, admin = frappe.get_value(
			"Project", project, ["project_owner", "project_leader", "project_admin"]
		)
		people |= {e for e in (owner, leader, admin) if e}
	if reference_doctype == "Project Todo":
		assignee = frappe.get_value("Project Todo", reference_name, "assigned_to")
		if assignee:
			people.add(assignee)
	return {p for p in people if p}


@frappe.whitelist()
def add_comment(reference_doctype, reference_name, content):
	"""Add a built-in comment to a Project / Project Detail / Project Item."""
	_assert_comment_visible(reference_doctype, reference_name)
	content = (content or "").strip()
	if not content:
		frappe.throw("Comment cannot be empty.")
	doc = frappe.get_doc(reference_doctype, reference_name)
	c = doc.add_comment("Comment", content)
	frappe.db.commit()

	actor = frappe.session.user
	actor_name = (_user_name_map({actor}).get(actor) or {}).get("full_name") or actor
	mentioned = _parse_mentions(content)
	# Mention notifications take precedence over the generic comment ping for the
	# same person (don't double-notify a mentioned participant).
	for u in mentioned:
		_notify(
			recipient=u,
			type="Mention",
			title=f"{actor_name} mentioned you",
			body=f"{actor_name} mentioned you in a comment.",
			reference_doctype=reference_doctype,
			reference_name=reference_name,
			actor=actor,
		)
	for u in _comment_participants(reference_doctype, reference_name) - mentioned:
		_notify(
			recipient=u,
			type="Comment",
			title=f"New comment from {actor_name}",
			body=f"{actor_name} commented on an item you follow.",
			reference_doctype=reference_doctype,
			reference_name=reference_name,
			actor=actor,
		)

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
def get_mentionable_users(reference_doctype, reference_name):
	"""Project participants who can be @mentioned in a comment on this record:
	the project's owner, leader, admin, team members, and the assignees of the
	project's todos. Returns [{user, full_name, image}], de-duplicated, sorted by
	full name. Access is gated by comment visibility on the target."""
	_assert_comment_visible(reference_doctype, reference_name)
	project = _comment_project(reference_doctype, reference_name)
	if not project:
		return []

	owner, leader, admin = frappe.get_value(
		"Project", project, ["project_owner", "project_leader", "project_admin"]
	)
	emails = {e for e in (owner, leader, admin) if e}
	emails |= set(
		frappe.get_all(
			"Project Team",
			filters={"parent": project},
			pluck="user",
			limit_page_length=0,
		)
	)
	emails |= set(
		frappe.get_all(
			"Project Todo",
			filters={"project": project, "assigned_to": ["is", "set"]},
			pluck="assigned_to",
			limit_page_length=0,
		)
	)
	emails = {e for e in emails if e}
	name_map = _user_name_map(emails)
	out = [
		{
			"user": e,
			"full_name": (name_map.get(e) or {}).get("full_name") or e,
			"image": (name_map.get(e) or {}).get("user_image"),
			"avatar_config": (name_map.get(e) or {}).get("avatar_config"),
		}
		for e in emails
	]
	out.sort(key=lambda r: (r["full_name"] or "").lower())
	return out


@frappe.whitelist()
def get_project_detail(project_detail, include_cancelled=0):
	"""A Project Detail with its project items."""
	user = frappe.session.user
	detail = frappe.get_value(
		"Project Detail", project_detail,
		["name", "title", "project", "status", "is_pending", "current_condition",
		 "expected_outcome", "grouping", "keterangan_di_sow", "reward_type", "discount", "bonus_amount",
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
			"avatar_config": (team_map.get(tr["user"]) or {}).get("avatar_config"),
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
	emails = {r["assigned_to"], r["developed_by"], r["tested_by"], r["completed_by"], r.get("waiting_by")} | team_emails
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
	is_leader = user == r["project_leader"]
	is_owner = user == r["project_owner"]
	shaped["can_edit_estimate"] = is_sm or is_leader or is_owner
	shaped["can_edit_assigned"] = is_sm or is_leader
	_mentor = frappe.db.get_value("Project Todo", project_item, "mentor")
	shaped["mentor"] = _mentor or ""
	shaped["mentor_name"] = (frappe.db.get_value("User", _mentor, "full_name") or _mentor) if _mentor else ""
	_assigned = _assigned_allocations_map([r["name"]]).get(r["name"], [])
	shaped["assigned_allocation"] = _assigned_allocation_for(
		_assigned, shaped.get("deadline"), shaped.get("estimated") or 0
	)
	shaped["assigned_total"] = sum((a["minutes"] or 0) for a in shaped["assigned_allocation"])
	# Delete is a lead-only action and only while Planned or Cancelled.
	shaped["can_delete"] = (
		(is_sm or user in (r["project_owner"], r["project_leader"]))
		and shaped["status_key"] in ("planned", "cancelled")
	)

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
			"recurring_interval",
			"recurring_weekdays",
			"recurring_monthly_mode",
			"recurring_day_of_month",
			"recurring_nth",
			"recurring_paused",
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

	is_rec = bool(extra.get("is_recurring"))
	root_name = extra.get("original_todo") or project_item
	paused = bool(frappe.db.get_value("Project Todo", root_name, "recurring_paused"))
	next_fire = None
	if is_rec and sib:
		latest = sib[-1]  # max deadline
		head = frappe.get_doc("Project Todo", latest["name"])
		nf = head.calculate_next_occurrence(latest["deadline"])
		next_fire = str(nf) if nf else None
	until = extra.get("recurring_until")
	ended = is_rec and (next_fire is None or (until and getdate(next_fire) > getdate(until)))
	shaped["recurring"] = {
		"is_recurring": is_rec,
		"frequency": extra.get("recurring_frequency"),
		"interval": extra.get("recurring_interval") or 1,
		"weekdays": extra.get("recurring_weekdays") or "",
		"monthly_mode": extra.get("recurring_monthly_mode") or "Day of Month",
		"day_of_month": extra.get("recurring_day_of_month"),
		"nth": extra.get("recurring_nth") or "First",
		"until": str(until) if until else None,
		"paused": paused,
		"state": (None if not is_rec else ("paused" if paused else ("ended" if ended else "active"))),
		"next_fire": next_fire,
	}
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
			"avatar_config": (name_map.get(e) or {}).get("avatar_config"),
		}
		for e in sorted(team_emails)
	]
	return shaped


@frappe.whitelist()
def update_todo(
	project_item,
	to_do=None,
	start_date=None,
	deadline=None,
	leader_deadline=None,
	owner_deadline=None,
	estimated=None,
	assigned_to=None,
	group=None,
	level=None,
	level_id=None,
	is_recurring=None,
	recurring_frequency=None,
	recurring_until=None,
	estimated_planned_to_done=None,
	estimated_done_to_checked=None,
	estimated_checked_to_completed=None,
	blocked_by=None,
	blocking=None,
	mentor=None,
	is_waiting=None,
	waiting_reason=None,
	recurring_interval=None,
	recurring_weekdays=None,
	recurring_monthly_mode=None,
	recurring_day_of_month=None,
	recurring_nth=None,
	recurring_paused=None,
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

		# `estimated` drives scoring — only leader/owner/SM may change it.
		if estimated is not None and int(estimated) != int(row.estimated or 0):
			if not (is_sm or user in (project.project_owner, project.project_leader)):
				return {"status": "error", "message": "Only the project leader or owner can change the estimate."}
			# A new estimate invalidates any explicit assigned split — fall back to
			# the virtual default; the leader can re-split afterward.
			row.set("assigned_allocation", [])

		if to_do is not None and to_do.strip():
			row.to_do = to_do.strip()
		if start_date is not None:
			row.start_date = start_date
		if deadline is not None:
			row.deadline = deadline
		# Optional phase deadlines: empty string clears them.
		if leader_deadline is not None:
			row.leader_deadline = leader_deadline or None
		if owner_deadline is not None:
			row.owner_deadline = owner_deadline or None
		if estimated is not None and estimated != "":
			row.estimated = int(estimated)
		_prev_assignee = row.assigned_to
		if assigned_to is not None and assigned_to:
			row.assigned_to = assigned_to
		# Mentor credit is leader/owner-set only (assignees can't credit themselves).
		# Empty string clears it.
		if mentor is not None:
			if not (is_sm or user in (project.project_owner, project.project_leader)):
				return {"status": "error", "message": "Only the project leader or owner can set the mentor."}
			row.mentor = mentor or None
		if group is not None and group:
			row.group = group
		# `level_id` is the stable reference (truth); the controller's
		# snapshot_point_from_level refreshes the cached `level` name + point from it.
		# `level` is still accepted for backward compatibility with older clients.
		if level_id is not None:
			row.level_id = level_id or None
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
		_pause_root = None
		_pause_val = None
		if is_recurring is not None:
			row.is_recurring = 1 if str(is_recurring) in ("1", "true", "True") else 0
			if not row.is_recurring:
				row.recurring_frequency = None
				row.recurring_until = None
				row.recurring_interval = None
				row.recurring_weekdays = None
				row.recurring_monthly_mode = None
				row.recurring_day_of_month = None
				row.recurring_nth = None
				# ponytail: clear pause on series root so a previously-paused series
				# doesn't silently come back paused if recurring is later re-enabled.
				from vernon_project.vernon_project.doctype.project_todo.project_todo import series_root
				_pause_root = series_root(row.name, row.original_todo)
				_pause_val = 0
		if recurring_frequency is not None:
			row.recurring_frequency = recurring_frequency or None
		if recurring_until is not None:
			row.recurring_until = recurring_until or None
		if row.is_recurring:
			if recurring_interval is not None:
				row.recurring_interval = cint(recurring_interval) or 1
			if recurring_weekdays is not None:
				row.recurring_weekdays = recurring_weekdays or ""
			if recurring_monthly_mode is not None:
				row.recurring_monthly_mode = recurring_monthly_mode or "Day of Month"
			if recurring_day_of_month is not None:
				row.recurring_day_of_month = cint(recurring_day_of_month) or None
			if recurring_nth is not None:
				row.recurring_nth = recurring_nth or "First"
			if recurring_paused is not None:
				from vernon_project.vernon_project.doctype.project_todo.project_todo import series_root
				_pause_root = series_root(row.name, row.original_todo)
				_pause_val = cint(recurring_paused)

		# Per-phase estimates in MINUTES (controller sums into total_estimated_hours).
		# planned_to_done is deprecated (covered by the main `estimated` field).
		for fld, val in (
			("estimated_done_to_checked", estimated_done_to_checked),
			("estimated_checked_to_completed", estimated_checked_to_completed),
		):
			if val is not None and val != "":
				row.set(fld, int(val))

		# Waiting flag (parked / on-hold). The controller's track_waiting enforces
		# the required-reason rule and the Planned-only constraint on save.
		if is_waiting is not None:
			row.is_waiting = 1 if str(is_waiting) in ("1", "true", "True") else 0
		if waiting_reason is not None:
			row.waiting_reason = waiting_reason or None

		row.save(ignore_permissions=True)

		# pause is a series-level flag on the root; write after save so row.save()
		# doesn't overwrite it when root == row.name.
		if _pause_root is not None:
			frappe.db.set_value("Project Todo", _pause_root,
							"recurring_paused", _pause_val, update_modified=False)

		# Mentor credit normally lands on the Completed transition. If a leader sets
		# or clears the mentor on an already-completed todo, re-sync so it still takes
		# effect (idempotent on todo+role).
		if mentor is not None and row.status == STATUS_COMPLETED:
			row.sync_point_ledger()

		if row.assigned_to and row.assigned_to != _prev_assignee:
			actor_name = (_user_name_map({user}).get(user) or {}).get("full_name") or user
			_notify(
				recipient=row.assigned_to,
				type="Assignment",
				title="New task assigned",
				body=f"{actor_name} assigned you: {row.to_do}",
				reference_doctype="Project Todo",
				reference_name=row.name,
				actor=user,
			)

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
def delete_todo(project_item):
	"""Permanently delete a Planned or Cancelled todo. Owner/Leader/System Manager only.

	Distinct from cancel_todo (reversible status flip): this removes the row.
	The doctype's on_trash is the real enforcement of the status gate; the checks
	here add the Owner/Leader permission and return a clean error message."""
	user = frappe.session.user
	if not frappe.db.exists("Project Todo", project_item):
		return {"status": "error", "message": "Task not found."}
	row = frappe.get_doc("Project Todo", project_item)
	detail_project = (
		frappe.get_value("Project Detail", row.project_detail, "project")
		if row.project_detail else None
	)
	if not detail_project:
		return {"status": "error", "message": "Task not found."}
	project = frappe.get_doc("Project", detail_project)
	is_sm = "System Manager" in frappe.get_roles(user)
	if not (is_sm or user in (project.project_owner, project.project_leader)):
		return {"status": "error", "message": "Only the Project Owner or Project Leader can delete a task."}
	if row.status not in (STATUS_PLANNED, STATUS_CANCELLED):
		return {"status": "error", "message": "Only a Scheduled or Cancelled task can be deleted."}
	frappe.delete_doc("Project Todo", project_item, ignore_permissions=True)
	return {"status": "ok", "message": "Task deleted."}


def _alloc_sum_error(rows, estimated):
	"""Return a friendly message if the rows' minutes don't sum to `estimated`
	(only enforced when estimated > 0), else None."""
	estimated = int(estimated or 0)
	if estimated <= 0:
		return None
	total = sum(int(r.get("minutes") or r.get("estimated_minutes") or 0) for r in (rows or []))
	if total == estimated:
		return None
	diff = estimated - total
	short = f"{diff}m short of" if diff > 0 else f"{-diff}m over"
	return f"Assigned split is {short} the {estimated}m estimate."


def _assigned_allocation_for(allocs, deadline, estimated):
	"""Explicit assigned rows, or the virtual default (whole estimate on the
	deadline) when none exist. Returns a list of {date, minutes, note}."""
	if allocs:
		return allocs
	estimated = int(estimated or 0)
	if estimated > 0 and deadline:
		return [{"date": str(deadline), "minutes": estimated, "note": ""}]
	return []


@frappe.whitelist()
def set_todo_allocations(project_item, allocations):
	"""Assignee-only: replace a todo's personal day-plan (free-form minutes, not scored)."""
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
		for a in allocations or []:
			d = a.get("date") or a.get("allocation_date")
			if not d:
				continue
			minutes = int(a.get("minutes") or a.get("estimated_minutes") or 0)
			doc.append("allocations", {
				"allocation_date": d,
				"estimated_minutes": minutes,
				"note": (a.get("note") or "").strip(),
			})
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
	user_opts = sorted(
		[{"value": u["name"], "label": u.get("full_name") or u["name"]} for u in users],
		key=lambda x: x["label"],
	)

	def _with_role(role):
		# owner/leader pickers only offer users who actually hold the role
		# (mirrors Project.validate_lead_roles). Admin/team keep the full list.
		holders = set(
			frappe.get_all(
				"Has Role", filters={"parenttype": "User", "role": role}, pluck="parent"
			)
		)
		return [o for o in user_opts if o["value"] in holders]

	return {
		"brands": sorted(
			[{"value": b["name"], "label": b.get("brand_name") or b["name"]} for b in brands],
			key=lambda x: x["label"],
		),
		"users": user_opts,
		"owners": _with_role("Project Owner"),
		"leaders": _with_role("Project Leader"),
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
		fields=["name", "full_name", "enabled", "user_image", "last_active", "custom_member_type as member_type"],
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
	avatar_map = _avatar_config_map([u["name"] for u in users])
	for u in users:
		u["roles"] = sorted(roles_by_user.get(u["name"], []))
		u["avatar_config"] = avatar_map.get(u["name"])
	return {"users": users}


def _clean_roles(roles):
	"""Parse the incoming roles list and keep only valid Vernon roles."""
	if isinstance(roles, str):
		roles = frappe.parse_json(roles) if roles else []
	return [r for r in (roles or []) if r in VERNON_ROLES]


def _clean_member_type(value):
	"""Validate a member-type marking; reject anything not in MEMBER_TYPES."""
	value = (value or "").strip()
	if value not in MEMBER_TYPES:
		frappe.throw(f"Invalid member type: {value}")
	return value


@frappe.whitelist()
def create_user(email, full_name=None, roles=None, send_welcome=1, member_type=None):
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
		"custom_member_type": _clean_member_type(member_type),
		"send_welcome_email": 1 if frappe.utils.cint(send_welcome) else 0,
	})
	doc.insert(ignore_permissions=True)
	if wanted:
		doc.add_roles(*wanted)
	return {"name": doc.name}


@frappe.whitelist()
def update_user(user, full_name=None, roles=None, enabled=1, member_type=None):
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
	if member_type is not None:
		doc.custom_member_type = _clean_member_type(member_type)
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
	"""Return {tier_name, color, icon} for the highest is_tier achievement the user clears, or None."""
	pts = _badge_points(user)
	s = _gami_settings()
	tiers = [a for a in (s.achievements or []) if a.is_tier]
	tiers.sort(key=lambda a: float(a.threshold or 0), reverse=True)
	for t in tiers:
		if pts >= float(t.threshold or 0):
			return {"tier_name": t.title, "color": t.color, "icon": t.icon}
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


@frappe.whitelist()
def get_app_settings():
	def g(field):
		return frappe.db.get_single_value("Vernon Settings", field)

	return {
		"max_estimated_minutes": int(g("max_estimated_minutes") or 0),
		"under_occupied_tolerance_minutes": int(g("under_occupied_tolerance_minutes") or 0),
		"attendance_enabled": int(g("attendance_enabled") or 0),
		"qr_validity_seconds": int(g("qr_validity_seconds") or 0),
		"attendance_grace_minutes": int(g("attendance_grace_minutes") or 0),
		"late_penalty_per_minute": float(g("late_penalty_per_minute") or 0),
		"early_leave_penalty_per_minute": float(g("early_leave_penalty_per_minute") or 0),
		"absence_penalty": float(g("absence_penalty") or 0),
		"home_banners": [
			{"image": b.image, "link": b.link or "", "is_active": int(b.is_active or 0)}
			for b in frappe.get_single("Vernon Settings").get("home_banners") or []
		],
	}


def _require_settings_manager():
	roles = set(frappe.get_roles(frappe.session.user))
	if not ({"System Manager", "Group Manager"} & roles):
		frappe.throw("Not permitted", frappe.PermissionError)


@frappe.whitelist()
def get_home_banners():
	"""Active home banners for the mobile home carousel, in display order.
	Readable by any signed-in user (no admin gate)."""
	return [
		{"image": b.image, "link": b.link or ""}
		for b in frappe.get_single("Vernon Settings").get("home_banners") or []
		if b.is_active and b.image
	]


@frappe.whitelist()
def upload_banner_image():
	"""Save an uploaded home-banner image as a public File and return its URL.
	Same raster-only safety checks as reward images; gated on settings admins."""
	_require_settings_manager()
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


@frappe.whitelist()
def save_app_settings(
	max_estimated_minutes=None,
	under_occupied_tolerance_minutes=None,
	attendance_enabled=None,
	qr_validity_seconds=None,
	attendance_grace_minutes=None,
	late_penalty_per_minute=None,
	early_leave_penalty_per_minute=None,
	absence_penalty=None,
	home_banners=None,
):
	_require_settings_manager()

	settings = frappe.get_single("Vernon Settings")
	# Each field is optional; only the ones provided in the request are updated.
	int_fields = {
		"max_estimated_minutes": max_estimated_minutes,
		"under_occupied_tolerance_minutes": under_occupied_tolerance_minutes,
		"attendance_enabled": attendance_enabled,
		"qr_validity_seconds": qr_validity_seconds,
		"attendance_grace_minutes": attendance_grace_minutes,
	}
	float_fields = {
		"late_penalty_per_minute": late_penalty_per_minute,
		"early_leave_penalty_per_minute": early_leave_penalty_per_minute,
		"absence_penalty": absence_penalty,
	}
	for field, value in int_fields.items():
		if value is not None:
			ival = int(value)
			if ival < 0:
				frappe.throw(f"{field} cannot be negative.")
			settings.set(field, ival)
	for field, value in float_fields.items():
		if value is not None:
			fval = float(value)
			if fval < 0:
				frappe.throw(f"{field} cannot be negative.")
			settings.set(field, fval)
	# Home banners: full replace when provided (JSON list of {image, link, is_active}).
	if home_banners is not None:
		if isinstance(home_banners, str):
			home_banners = frappe.parse_json(home_banners)
		settings.set("home_banners", [])
		for b in home_banners or []:
			image = (b.get("image") or "").strip()
			if not image:
				continue
			settings.append(
				"home_banners",
				{"image": image, "link": (b.get("link") or "").strip(), "is_active": 1 if b.get("is_active") else 0},
			)
	settings.save(ignore_permissions=True)
	frappe.db.commit()
	return get_app_settings()


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
	unlocked = frappe.db.sql(
		"select coalesce(sum(cost),0) from `tabAvatar Unlock` where user=%s", user
	)[0][0] or 0
	events_spent = frappe.db.sql(
		"select coalesce(sum(amount),0) from `tabVernon Event Registration` "
		"where user=%s and method='Points' and status != 'Cancelled'",
		user,
	)[0][0] or 0
	balance = earned - redeemed - float(unlocked) - float(events_spent)
	return earned, redeemed, balance


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


# Weekday index (Mon=0 .. Sun=6, matching datetime.date.weekday()) -> label.
WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@frappe.whitelist()
def get_weekly_recap(week_offset=0):
	"""Read-only weekly summary for the logged-in user. Week = Monday–Sunday;
	week_offset 0 = current week, -1 = last week, etc. Nothing is materialized
	and there is no scheduler — everything is computed live from existing data."""
	from datetime import timedelta

	user = frappe.session.user
	week_offset = int(week_offset or 0)

	today = getdate(nowdate())  # datetime.date
	monday = today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)
	sunday = monday + timedelta(days=6)
	week_end_excl = sunday + timedelta(days=1)  # exclusive upper bound for datetimes

	# Completed todos assigned to me, completed within the week.
	completed_rows = frappe.db.sql(
		"""
		SELECT t.estimated, t.completed_at, t.project, p.project_name
		FROM `tabProject Todo` t
		LEFT JOIN `tabProject` p ON t.project = p.name
		WHERE t.assigned_to = %(user)s
		  AND t.status = %(completed)s
		  AND t.completed_at >= %(start)s
		  AND t.completed_at < %(end)s
		""",
		{"user": user, "completed": STATUS_COMPLETED, "start": str(monday), "end": str(week_end_excl)},
		as_dict=True,
	)

	completed = len(completed_rows)
	minutes = sum(int(r["estimated"] or 0) for r in completed_rows)

	# Best day (most completions) + top project (most completions), in one pass.
	per_day = {}
	per_project = {}
	for r in completed_rows:
		wd = getdate(r["completed_at"]).weekday()
		per_day[wd] = per_day.get(wd, 0) + 1
		pname = r.get("project_name") or r.get("project")
		if pname:
			per_project[pname] = per_project.get(pname, 0) + 1

	best_day = None
	if per_day:
		wd, cnt = max(per_day.items(), key=lambda kv: kv[1])
		best_day = {"label": WEEKDAY_LABELS[wd], "count": cnt}

	top_project = None
	if per_project:
		pname, cnt = max(per_project.items(), key=lambda kv: kv[1])
		top_project = {"name": pname, "count": cnt}

	# Points credited this week from real work only (Todo + Meeting; never Grant/Gift).
	points = float(frappe.db.sql(
		"""
		SELECT COALESCE(SUM(points_earned), 0)
		FROM `tabPoint Ledger`
		WHERE user = %(user)s
		  AND credited_on >= %(start)s AND credited_on < %(end)s
		  AND source IN ('Todo', 'Meeting')
		""",
		{"user": user, "start": str(monday), "end": str(week_end_excl)},
	)[0][0])

	# Streak = consecutive days up to *today* with >=1 completion (independent of
	# the viewed week). ponytail: 60-day lookback cap is plenty for a streak
	# badge; widen the `since` bound if anyone ever needs a longer streak.
	streak_rows = frappe.db.sql(
		"""
		SELECT DISTINCT DATE(completed_at) AS d
		FROM `tabProject Todo`
		WHERE assigned_to = %(user)s
		  AND status = %(completed)s
		  AND completed_at >= %(since)s
		""",
		{"user": user, "completed": STATUS_COMPLETED, "since": str(today - timedelta(days=60))},
	)
	done_days = {str(r[0]) for r in streak_rows}
	streak = 0
	cur = today
	while str(cur) in done_days:
		streak += 1
		cur = cur - timedelta(days=1)

	# Kudos received = Todo Reaction rows on my todos created this week. Feature 3
	# (the Todo Reaction doctype) may not be shipped yet — return 0 safely.
	kudos_received = 0
	if frappe.db.exists("DocType", "Todo Reaction"):
		kudos_received = int(frappe.db.sql(
			"""
			SELECT COUNT(*)
			FROM `tabTodo Reaction` r
			JOIN `tabProject Todo` t ON r.todo = t.name
			WHERE t.assigned_to = %(user)s
			  AND r.creation >= %(start)s AND r.creation < %(end)s
			""",
			{"user": user, "start": str(monday), "end": str(week_end_excl)},
		)[0][0])

	# Reciprocity: how many kudos I gave this week, and who appreciated me most
	# (so the recap can offer a one-tap thank-back). Safe if Todo Reaction is absent.
	kudos_given = 0
	top_appreciator = None
	if frappe.db.exists("DocType", "Todo Reaction"):
		kudos_given = int(frappe.db.sql(
			"""
			SELECT COUNT(*)
			FROM `tabTodo Reaction` r
			WHERE r.user = %(user)s
			  AND r.creation >= %(start)s AND r.creation < %(end)s
			""",
			{"user": user, "start": str(monday), "end": str(week_end_excl)},
		)[0][0])
		top = frappe.db.sql(
			"""
			SELECT r.user AS u, COUNT(*) AS c
			FROM `tabTodo Reaction` r
			JOIN `tabProject Todo` t ON r.todo = t.name
			WHERE t.assigned_to = %(user)s
			  AND r.user != %(user)s
			  AND r.creation >= %(start)s AND r.creation < %(end)s
			GROUP BY r.user
			ORDER BY c DESC
			LIMIT 1
			""",
			{"user": user, "start": str(monday), "end": str(week_end_excl)},
			as_dict=True,
		)
		if top:
			appreciator = top[0]["u"]
			name = frappe.db.get_value("User", appreciator, "full_name") or appreciator
			top_appreciator = {"user": appreciator, "name": name, "count": int(top[0]["c"])}

	# Week label, e.g. "Jun 23–29" (same month) or "Jun 30–Jul 6" (spans months).
	if monday.month == sunday.month:
		week_label = f"{monday.strftime('%b')} {monday.day}–{sunday.day}"
	else:
		week_label = f"{monday.strftime('%b')} {monday.day}–{sunday.strftime('%b')} {sunday.day}"

	return {
		"week_offset": week_offset,
		"week_label": week_label,
		"week_start": str(monday),
		"week_end": str(sunday),
		"completed": completed,
		"minutes": minutes,
		"points": round(points, 1),
		"best_day": best_day,
		"streak": streak,
		"top_project": top_project,
		"kudos_received": kudos_received,
		"kudos_given": kudos_given,
		"top_appreciator": top_appreciator,
	}


@frappe.whitelist()
def say_thanks(to_user):
	"""Reciprocity: thank someone who cheered your work this week. Fires a Kudos
	notification to them. No points (no Recognition ledger exists) — it just
	closes the appreciation loop."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	if not to_user or to_user == user:
		return {"status": "error", "message": "Nobody to thank."}
	if not frappe.db.exists("User", to_user):
		return {"status": "error", "message": "Unknown user."}
	me = frappe.db.get_value("User", user, "full_name") or user
	_notify(
		to_user,
		"Kudos",
		f"{me} said thanks 🙏",
		"Thanks for the kudos this week!",
		actor=user,
	)
	return {"status": "ok"}


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
def get_leaderboard(period="monthly", brand=None, dimension="productivity"):
	"""Top 50 users by points earned in the period; plus the caller's own rank.

	dimension='productivity' (default) ranks earned work (excludes gifts/grants and
	the character sources). dimension='character' ranks gifts of attention —
	Recognition (kudos) + Mentoring — so helping is celebrated on its own board."""
	if period not in ("weekly", "monthly", "all"):
		period = "monthly"
	if dimension not in ("productivity", "character"):
		dimension = "productivity"
	brand = brand or None

	start = _period_start(period)
	conds = []
	params = {}
	join = ""
	if dimension == "character":
		conds.append("coalesce(pl.source, 'Todo') in ('Recognition', 'Mentoring')")
	else:
		conds.append("coalesce(pl.source, 'Todo') not in ('Grant', 'Gift', 'Daily', 'Reward', 'Achievement', 'Mentoring', 'Recognition')")
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
			"avatar_config": info.get("avatar_config"),
			"points": float(row["points"]),
			"rank": rank,
			"badge": _user_badge(row["user"]),
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

	return {"period": period, "brand": brand, "dimension": dimension, "brands": brands, "entries": entries, "me": me}


# --------------------------------------------------------------------------------
# Marketplace — browse active rewards and redeem (instant deduct).
# --------------------------------------------------------------------------------


@frappe.whitelist()
def get_marketplace():
	"""Active catalog + the caller's spendable balance."""
	_, _, balance = _user_balance(frappe.session.user)
	rewards = frappe.get_all(
		"Marketplace Reward",
		filters={"active": 1, "avatar_item": ["is", "not set"]},
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
	lock_key = f"vernon_spend:{user}"
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


@frappe.whitelist()
def upload_comment_image(reference_doctype=None, reference_name=None):
	"""Save an uploaded comment image as a public File and return its URL. The
	caller (CommentThread) then inlines the URL as an <img src="/files/..."> in
	the comment HTML content.

	Access is gated by comment visibility on the target record. Only raster image
	types are accepted: the file is served public, so SVG/HTML (stored-XSS
	vectors) and other content are rejected by extension and MIME, mirroring
	upload_reward_image."""
	if reference_doctype and reference_name:
		_assert_comment_visible(reference_doctype, reference_name)
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
	frappe.db.commit()
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

	_notify(
		recipient=user,
		type="Points",
		title="You received points",
		body=f"You were granted {int(amount)} points.",
		reference_doctype="Wallet",
		reference_name=user,
		actor=frappe.session.user,
	)

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
	avatar_map = _avatar_config_map([u["name"] for u in users])
	for u in users:
		u["avatar_config"] = avatar_map.get(u["name"])
	return {"users": users}


def _project_team(project):
	"""Users on a project's team. Owner/leader/admin are auto-appended here by
	Project.validate, so this single table is the membership source of truth —
	same one Project Todo.validate_assigned_to_team_member checks."""
	return set(
		frappe.get_all(
			"Project Team",
			filters={"parent": project, "parenttype": "Project"},
			pluck="user",
		)
	)


@frappe.whitelist()
def list_transfer_users():
	"""All non-protected users (including disabled) for the task-transfer pickers.

	Disabled users are included on purpose: their orphaned open tasks — ones the
	on-disable offboarding hook could not reassign — are the main reason to
	transfer. The To picker filters to enabled users client-side.
	"""
	_require_system_manager()
	users = frappe.get_all(
		"User",
		filters={"name": ["not in", PROTECTED_USERS]},
		fields=["name", "full_name", "user_image", "enabled"],
		limit_page_length=0,
		order_by="full_name asc",
	)
	avatar_map = _avatar_config_map([u["name"] for u in users])
	for u in users:
		u["avatar_config"] = avatar_map.get(u["name"])
	return {"users": users}


@frappe.whitelist()
def transfer_tasks(from_user, to_user, project=None, dry_run=0):
	"""Reassign one user's open Project Todos to another (all projects, or one).

	Open = status not in TERMINAL_STATUSES; completed/cancelled stay put as
	historical record. Atomic team gate: if to_user is not on the Project Team
	of any affected project, the whole transfer is refused and nothing moves.
	dry_run=1 returns {count, blocked_projects} without writing.
	"""
	from vernon_project.user_offboarding import TERMINAL_STATUSES

	_require_system_manager()
	from_user = (from_user or "").strip()
	to_user = (to_user or "").strip()
	project = (project or "").strip() or None

	if from_user in PROTECTED_USERS or not frappe.db.exists("User", from_user):
		frappe.throw("Unknown source user")
	if to_user in PROTECTED_USERS or not frappe.db.exists("User", to_user):
		frappe.throw("Unknown target user")
	if from_user == to_user:
		frappe.throw("Source and target user must differ")
	if not frappe.db.get_value("User", to_user, "enabled"):
		frappe.throw("Target user is disabled")
	if project and not frappe.db.exists("Project", project):
		frappe.throw("Unknown project")

	filters = {"assigned_to": from_user, "status": ["not in", TERMINAL_STATUSES]}
	if project:
		filters["project"] = project
	todos = frappe.get_all("Project Todo", filters=filters, fields=["name", "project"])

	# Team gate. ponytail: project-less todos have no team → always allowed.
	team_cache = {}
	blocked = set()
	for t in todos:
		if not t.project:
			continue
		if t.project not in team_cache:
			team_cache[t.project] = _project_team(t.project)
		if to_user not in team_cache[t.project]:
			blocked.add(t.project)
	blocked_projects = sorted(blocked)

	if frappe.utils.cint(dry_run):
		return {"count": len(todos), "blocked_projects": blocked_projects}

	if blocked_projects:
		frappe.throw(
			f"{to_user} is not on the Project Team of: " + ", ".join(blocked_projects)
		)

	# Raw update mirrors user_offboarding: intended admin override, skips
	# re-running point-ledger/recurrence hooks (open tasks have 0 earned).
	# Recurrence still follows — next-occurrence reads assigned_to fresh from DB.
	for t in todos:
		frappe.db.set_value("Project Todo", t.name, "assigned_to", to_user)
	frappe.db.commit()
	return {"moved": len(todos)}


@frappe.whitelist()
def get_team_wall():
	"""All enabled, non-protected users with avatar snapshot — for the team wall.

	Org-wide read: returns only display name + avatar image, the same fields
	get_leaderboard already exposes to every user. Ungated, unlike
	list_grant_users (which gates on the grant-points permission).
	"""
	users = frappe.get_all(
		"User",
		filters={"name": ["not in", PROTECTED_USERS], "enabled": 1},
		fields=["name", "full_name", "user_image"],
		limit_page_length=0,
		order_by="full_name asc",
	)
	avatar_map = _avatar_config_map([u["name"] for u in users])
	for u in users:
		u["avatar_config"] = avatar_map.get(u["name"])
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

	sender_name = (_user_name_map({sender}).get(sender) or {}).get("full_name") or sender
	_notify(
		recipient=to_user,
		type="Points",
		title="You received a gift",
		body=f"{sender_name} gifted you {amount} points.",
		reference_doctype="Wallet",
		reference_name=to_user,
		actor=sender,
	)

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
	avatar_map = _avatar_config_map([u["name"] for u in users])
	for u in users:
		u["avatar_config"] = avatar_map.get(u["name"])
	return {"users": users}


@frappe.whitelist()
def data_health():
	"""Manager-only data-quality report over Project Todo. See
	docs/superpowers/specs/2026-06-26-data-health-report-design.md."""
	roles = set(frappe.get_roles(frappe.session.user))
	if not ({"System Manager", "Group Manager", "Project Owner"} & roles):
		frappe.throw("Not permitted", frappe.PermissionError)

	INFLIGHT = ("⚪️ Planned", "🟠 Done", "🔷 Checked By PL")
	CAP = 200
	mx = frappe.db.get_single_value("Vernon Settings", "max_estimated_minutes") or 0

	def pack(rows):
		return [
			{
				"name": r.name,
				"to_do": r.to_do,
				"group": r.group,
				"status": r.status,
				"detail": r.detail,
			}
			for r in rows
		]

	# 1. Unmapped type/level
	unmapped = frappe.db.sql(
		"""
		SELECT name, to_do, `group`, status, 'no type/level' AS detail
		FROM `tabProject Todo`
		WHERE status IN %(inflight)s AND level_id IS NULL
		ORDER BY modified DESC LIMIT %(cap)s
		""",
		{"inflight": INFLIGHT, "cap": CAP}, as_dict=True,
	)
	unmapped_n = frappe.db.sql(
		"SELECT COUNT(*) FROM `tabProject Todo` WHERE status IN %(inflight)s AND level_id IS NULL",
		{"inflight": INFLIGHT},
	)[0][0]

	# 2. Outlier estimate (> max_estimated_minutes on one task)
	if mx and mx > 0:
		outliers = frappe.db.sql(
			"""
			SELECT name, to_do, `group`, status,
			       CONCAT('estimated ', ROUND(estimated), ' min') AS detail
			FROM `tabProject Todo`
			WHERE status IN ('⚪️ Planned', '🟠 Done', '🔷 Checked By PL') AND estimated > %(mx)s
			ORDER BY estimated DESC LIMIT %(cap)s
			""",
			{"mx": mx, "cap": CAP}, as_dict=True,
		)
		outliers_n = frappe.db.sql(
			"SELECT COUNT(*) FROM `tabProject Todo` "
			"WHERE status IN ('⚪️ Planned', '🟠 Done', '🔷 Checked By PL') AND estimated > %(mx)s",
			{"mx": mx},
		)[0][0]
	else:
		outliers, outliers_n = [], 0

	# 3. Missing fields (in-flight)
	missing_rows = frappe.db.sql(
		"""
		SELECT name, to_do, `group`, status, estimated, deadline, start_date
		FROM `tabProject Todo`
		WHERE status IN %(inflight)s AND (
			`group` IS NULL OR `group` = '' OR estimated IS NULL OR estimated = 0
			OR deadline IS NULL OR start_date IS NULL
		)
		ORDER BY modified DESC LIMIT %(cap)s
		""",
		{"inflight": INFLIGHT, "cap": CAP}, as_dict=True,
	)
	for r in missing_rows:
		miss = []
		if not r.group:
			miss.append("group")
		if not r.estimated:
			miss.append("estimate")
		if not r.deadline:
			miss.append("deadline")
		if not r.start_date:
			miss.append("start_date")
		r.detail = "missing: " + ", ".join(miss)
	missing_n = frappe.db.sql(
		"""
		SELECT COUNT(*) FROM `tabProject Todo`
		WHERE status IN %(inflight)s AND (
			`group` IS NULL OR `group` = '' OR estimated IS NULL OR estimated = 0
			OR deadline IS NULL OR start_date IS NULL)
		""",
		{"inflight": INFLIGHT},
	)[0][0]

	# 4. Orphaned level_id or junk title
	orphaned = frappe.db.sql(
		"""
		SELECT t.name, t.to_do, t.`group`, t.status,
		       CASE
		         WHEN t.level_id IS NOT NULL AND gl.level_id IS NULL THEN 'orphaned level_id'
		         ELSE 'junk title'
		       END AS detail
		FROM `tabProject Todo` t
		LEFT JOIN `tabGroup Level` gl ON gl.level_id = t.level_id
		WHERE t.status IN ('⚪️ Planned', '🟠 Done', '🔷 Checked By PL') AND (
		      (t.level_id IS NOT NULL AND gl.level_id IS NULL)
		   OR LOWER(TRIM(t.to_do)) IN ('x','seed','test','testing')
		   OR CHAR_LENGTH(TRIM(t.to_do)) <= 2
		)
		ORDER BY t.modified DESC LIMIT %(cap)s
		""",
		{"cap": CAP}, as_dict=True,
	)
	orphaned_n = frappe.db.sql(
		"""
		SELECT COUNT(*) FROM `tabProject Todo` t
		LEFT JOIN `tabGroup Level` gl ON gl.level_id = t.level_id
		WHERE t.status IN ('⚪️ Planned', '🟠 Done', '🔷 Checked By PL') AND (
		      (t.level_id IS NOT NULL AND gl.level_id IS NULL)
		   OR LOWER(TRIM(t.to_do)) IN ('x','seed','test','testing')
		   OR CHAR_LENGTH(TRIM(t.to_do)) <= 2)
		"""
	)[0][0]

	return {
		"counts": {
			"unmapped": unmapped_n, "outliers": outliers_n,
			"missing": missing_n, "orphaned": orphaned_n,
			"total": unmapped_n + outliers_n + missing_n + orphaned_n,
		},
		"unmapped": pack(unmapped),
		"outliers": pack(outliers),
		"missing": pack(missing_rows),
		"orphaned": pack(orphaned),
	}


# ================================================================================
# Personal Notes
# --------------------------------------------------------------------------------
# Private freetext + checklist notes, unrelated to projects (no points/deadline/
# project link). Owners may share read-only access with other users. See
# docs/superpowers/specs/2026-06-26-personal-notes-design.md for the contract.
# ================================================================================


def _require_user():
	"""Reject Guest; return the session user."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	return user


def _parse_items(items):
	"""Normalize the `items` param (JSON string or list) into a clean list of
	{label, checked} dicts, dropping rows with an empty label and preserving order."""
	if items is None:
		return []
	if isinstance(items, str):
		items = frappe.parse_json(items) if items.strip() else []
	out = []
	for row in (items or []):
		label = (row.get("label") or "").strip()
		if not label:
			continue
		out.append({"label": label, "checked": 1 if row.get("checked") else 0})
	return out


def _parse_users(users):
	"""Normalize the `users` param (JSON string or list) into a list of emails."""
	if users is None:
		return []
	if isinstance(users, str):
		users = frappe.parse_json(users) if users.strip() else []
	return [u for u in (users or []) if u]


def _shape_note(doc, user):
	"""Build the Note JSON for the session user. `shares` is populated only for the
	owner; shared viewers see [] and read-only (`can_edit == is_owner`)."""
	is_owner = doc.user == user
	name_map = _user_name_map({doc.user} | {r.shared_user for r in (doc.shares or [])})
	owner_row = name_map.get(doc.user) or {}
	shares = []
	if is_owner:
		for r in (doc.shares or []):
			info = name_map.get(r.shared_user) or {}
			shares.append({
				"user": r.shared_user,
				"full_name": info.get("full_name") or r.shared_user,
				"image": info.get("user_image"),
				"avatar_config": info.get("avatar_config"),
			})
	return {
		"name": doc.name,
		"title": doc.title or "",
		"body": doc.body or "",
		"items": [
			{"label": r.label, "checked": 1 if r.checked else 0, "idx": r.idx}
			for r in (doc.items or [])
		],
		"shares": shares,
		"is_owner": is_owner,
		"can_edit": is_owner,
		"owner_user": doc.user,
		"owner_name": owner_row.get("full_name") or doc.user,
		"modified": str(doc.modified),
	}


def _get_note_for_user(note_id, user):
	"""Load a Personal Note the user may read (owner OR shared-with), else None."""
	if not frappe.db.exists("Personal Note", note_id):
		return None
	doc = frappe.get_doc("Personal Note", note_id)
	if doc.user == user:
		return doc
	if any(r.shared_user == user for r in (doc.shares or [])):
		return doc
	return None


@frappe.whitelist()
def get_personal_notes():
	"""Notes owned by the session user and notes shared with them."""
	user = _require_user()
	owned_names = frappe.get_all(
		"Personal Note", filters={"user": user}, pluck="name",
		order_by="modified desc", limit_page_length=0,
	)
	shared_names = frappe.get_all(
		"Personal Note Share", filters={"shared_user": user}, pluck="parent",
		limit_page_length=0,
	)
	owned, shared = [], []
	for n in owned_names:
		owned.append(_shape_note(frappe.get_doc("Personal Note", n), user))
	# Shared list ordered newest-first by note modified; exclude any the user owns.
	shared_docs = [
		frappe.get_doc("Personal Note", n) for n in shared_names
	]
	shared_docs = [d for d in shared_docs if d.user != user]
	shared_docs.sort(key=lambda d: str(d.modified), reverse=True)
	for d in shared_docs:
		shared.append(_shape_note(d, user))
	return {"owned": owned, "shared": shared}


@frappe.whitelist()
def get_personal_note(note_id):
	"""A single note the session user owns or has been shared."""
	user = _require_user()
	doc = _get_note_for_user(note_id, user)
	if not doc:
		return {"status": "error", "message": "Not found"}
	return {"status": "ok", "note": _shape_note(doc, user)}


@frappe.whitelist()
def create_personal_note(title=None, body=None, items=None):
	"""Create a note owned by the session user. An entirely empty note
	(no title, body, or items) is discarded."""
	user = _require_user()
	title = (title or "").strip()
	body = (body or "").strip()
	parsed_items = _parse_items(items)
	if not title and not body and not parsed_items:
		return {"status": "ok"}
	doc = frappe.get_doc({
		"doctype": "Personal Note",
		"user": user,
		"title": title,
		"body": body,
		"items": [
			{"label": it["label"], "checked": it["checked"]} for it in parsed_items
		],
	})
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok", "name": doc.name}


@frappe.whitelist()
def update_personal_note(note_id, title=None, body=None, items=None):
	"""Update a note. Owner only. `items` is fully replaced, preserving order."""
	user = _require_user()
	if not frappe.db.exists("Personal Note", note_id):
		return {"status": "error", "message": "Not found"}
	doc = frappe.get_doc("Personal Note", note_id)
	if doc.user != user:
		return {"status": "error", "message": "Not permitted"}
	doc.title = (title or "").strip()
	doc.body = (body or "").strip()
	doc.set("items", [])
	for it in _parse_items(items):
		doc.append("items", {"label": it["label"], "checked": it["checked"]})
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok"}


@frappe.whitelist()
def delete_personal_note(note_id):
	"""Delete a note (cascades child items + shares). Owner only."""
	user = _require_user()
	if not frappe.db.exists("Personal Note", note_id):
		return {"status": "error", "message": "Not found"}
	owner = frappe.db.get_value("Personal Note", note_id, "user")
	if owner != user:
		return {"status": "error", "message": "Not permitted"}
	frappe.delete_doc("Personal Note", note_id, ignore_permissions=True, force=True)
	frappe.db.commit()
	return {"status": "ok"}


@frappe.whitelist()
def share_personal_note(note_id, users):
	"""Share a note with one or more users (read-only). Owner only. Self,
	duplicates, and unknown users are skipped. Returns the resulting share list."""
	user = _require_user()
	if not frappe.db.exists("Personal Note", note_id):
		return {"status": "error", "message": "Not found"}
	doc = frappe.get_doc("Personal Note", note_id)
	if doc.user != user:
		return {"status": "error", "message": "Not permitted"}
	existing = {r.shared_user for r in (doc.shares or [])}
	for email in _parse_users(users):
		if email == user or email in existing:
			continue
		if not frappe.db.exists("User", email):
			continue
		doc.append("shares", {"shared_user": email})
		existing.add(email)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok", "shares": _shape_note(doc, user)["shares"]}


@frappe.whitelist()
def unshare_personal_note(note_id, user):
	"""Remove a user's share from a note. Owner only. (`user` is the share target.)"""
	caller = _require_user()
	if not frappe.db.exists("Personal Note", note_id):
		return {"status": "error", "message": "Not found"}
	doc = frappe.get_doc("Personal Note", note_id)
	if doc.user != caller:
		return {"status": "error", "message": "Not permitted"}
	doc.set("shares", [r for r in (doc.shares or []) if r.shared_user != user])
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok"}


# ---------------------------------------------------------------------------
# Meetings
# ---------------------------------------------------------------------------

MEETING_SCHEDULED = "⚪️ Scheduled"
MEETING_DONE = "✅ Done"


def _meeting_can_manage(doc):
	user = frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return True
	owner, leader = frappe.get_value("Project", doc.project, ["project_owner", "project_leader"])
	return user in (doc.organizer, owner, leader)


@frappe.whitelist()
def create_meeting(project, title, scheduled_at=None, estimated=0, group=None,
				   level_id=None, participants=None, notes=None):
	try:
		if not frappe.db.exists("Project", project):
			return {"status": "error", "message": "Project not found."}
		user = frappe.session.user
		owner, leader = frappe.get_value("Project", project, ["project_owner", "project_leader"])
		if "System Manager" not in frappe.get_roles(user) and user not in (owner, leader):
			return {"status": "error", "message": "Only the Project Owner or Leader can create meetings."}
		rows = json.loads(participants) if isinstance(participants, str) else (participants or [])
		doc = frappe.get_doc({
			"doctype": "Meeting",
			"project": project,
			"title": title,
			"organizer": user,
			"scheduled_at": scheduled_at,
			"estimated": int(estimated or 0),
			"group": group,
			"level_id": level_id,
			"notes": notes,
			"status": MEETING_SCHEDULED,
			"participants": [{"user": u} for u in rows if u],
		})
		doc.insert(ignore_permissions=True)
		return {"status": "success", "message": "Meeting created.", "name": doc.name}
	except (frappe.ValidationError, ValueError, TypeError) as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def update_meeting(meeting, title=None, scheduled_at=None, estimated=None,
				   group=None, level_id=None, notes=None):
	try:
		doc = frappe.get_doc("Meeting", meeting)
		if not _meeting_can_manage(doc):
			return {"status": "error", "message": "You cannot edit this meeting."}
		if doc.status == MEETING_DONE:
			return {"status": "error", "message": "A completed meeting cannot be edited."}
		if title is not None:
			doc.title = title
		if scheduled_at is not None:
			doc.scheduled_at = scheduled_at
		if estimated is not None:
			doc.estimated = int(estimated or 0)
		if group is not None:
			doc.group = group
		if level_id is not None:
			doc.level_id = level_id
		if notes is not None:
			doc.notes = notes
		doc.save(ignore_permissions=True)
		return {"status": "success", "message": "Meeting updated."}
	except (frappe.ValidationError, ValueError, TypeError) as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def set_meeting_participants(meeting, users):
	try:
		doc = frappe.get_doc("Meeting", meeting)
		if not _meeting_can_manage(doc):
			return {"status": "error", "message": "You cannot edit this meeting."}
		if doc.status == MEETING_DONE:
			return {"status": "error", "message": "A completed meeting cannot be edited."}
		rows = json.loads(users) if isinstance(users, str) else (users or [])
		doc.set("participants", [{"user": u} for u in rows if u])
		doc.save(ignore_permissions=True)
		return {"status": "success", "message": "Participants updated."}
	except (frappe.ValidationError, ValueError, TypeError) as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def list_meetings(project=None):
	filters = {}
	if project:
		filters["project"] = project
	rows = frappe.get_list(
		"Meeting",
		filters=filters,
		fields=["name", "title", "project", "organizer", "scheduled_at",
				"estimated", "point", "status"],
		order_by="scheduled_at desc",
	)
	user = frappe.session.user
	roles = frappe.get_roles(user)
	for r in rows:
		r["participants"] = frappe.get_all(
			"Meeting Participant",
			filters={"parent": r["name"], "parenttype": "Meeting"},
			pluck="user",
		)
		owner, leader = frappe.get_value("Project", r["project"], ["project_owner", "project_leader"])
		r["can_mark_done"] = (
			"System Manager" in roles or user in (r["organizer"], owner, leader)
		)
	return {"meetings": rows}


@frappe.whitelist()
def mark_meeting_done(meeting):
	try:
		doc = frappe.get_doc("Meeting", meeting)
		if not _meeting_can_manage(doc):
			return {"status": "error", "message": "Only the organizer or Project Owner/Leader can mark this done."}
		if doc.status == MEETING_DONE:
			return {"status": "success", "message": "Already done."}
		doc.status = MEETING_DONE
		doc.save(ignore_permissions=True)
		return {"status": "success", "message": "Meeting marked done; points awarded."}
	except frappe.ValidationError as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def reopen_meeting(meeting):
	try:
		doc = frappe.get_doc("Meeting", meeting)
		if not _meeting_can_manage(doc):
			return {"status": "error", "message": "You cannot reopen this meeting."}
		if doc.status == MEETING_SCHEDULED:
			return {"status": "success", "message": "Already scheduled."}
		doc.status = MEETING_SCHEDULED
		doc.save(ignore_permissions=True)
		return {"status": "success", "message": "Meeting reopened; points removed."}
	except frappe.ValidationError as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def meeting_invitable_users(project, txt=""):
	if not project:
		return {"users": []}
	user = frappe.session.user
	if "System Manager" not in frappe.get_roles(user):
		owner, leader = frappe.get_value("Project", project, ["project_owner", "project_leader"]) or (None, None)
		is_team = frappe.db.exists("Project Team", {"parent": project, "parenttype": "Project", "user": user})
		if user not in (owner, leader) and not is_team:
			return {"users": []}
	team = frappe.get_all(
		"Project Team",
		filters={"parent": project, "parenttype": "Project"},
		pluck="user",
	)
	if not team:
		return {"users": []}
	like = f"%{txt}%"
	rows = frappe.db.sql(
		"""SELECT name AS user, full_name FROM `tabUser`
		   WHERE name IN %(team)s AND (name LIKE %(like)s OR full_name LIKE %(like)s)
		   ORDER BY full_name""",
		{"team": tuple(team), "like": like},
		as_dict=True,
	)
	return {"users": rows}


# --------------------------------------------------------------------------------
# Kudos / reactions — react to a teammate's completed work in a team activity feed.
# One reaction per (todo, user); enforced app-level (toggle/replace). Social only:
# no points awarded. Cannot react to a todo assigned to yourself.
# --------------------------------------------------------------------------------

REACTION_LABELS = {"clap": "Clap", "celebrate": "Celebrate", "fire": "Fire", "heart": "Heart"}


def _reaction_counts(todo, me=None):
	"""Per-reaction counts for one todo, plus the caller's own reaction (or None)."""
	rows = frappe.get_all(
		"Todo Reaction",
		filters={"todo": todo},
		fields=["user", "reaction"],
		limit_page_length=0,
	)
	counts = {"clap": 0, "celebrate": 0, "fire": 0, "heart": 0}
	mine = None
	for r in rows:
		if r["reaction"] in counts:
			counts[r["reaction"]] += 1
		if me and r["user"] == me:
			mine = r["reaction"]
	return counts, mine


@frappe.whitelist()
def get_team_activity(days=14, limit=50):
	"""Recent Completed todos in the caller's projects, newest first, each with a
	reaction-count summary, the caller's own reaction, and a few recent reactor
	names. Drives the /activity feed."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	days = frappe.utils.cint(days) or 14
	limit = frappe.utils.cint(limit) or 50
	cutoff = add_days(getdate(nowdate()), -days)

	# Activity feed is scoped to projects the caller is involved in
	# (owner/leader/admin, team member, or assignee) — even for System Managers,
	# who otherwise see every project. The point is to cheer your own teams, not
	# the whole company.
	projects = list(_involved_project_names(user))
	rows = _fetch_todos(projects)
	done = [
		r
		for r in rows
		if _status_key(r["status"]) == "completed"
		and r["completed_at"]
		and getdate(r["completed_at"]) >= cutoff
	]
	done.sort(key=lambda r: str(r["completed_at"]), reverse=True)
	done = done[:limit]
	if not done:
		return {"items": []}

	names = [r["name"] for r in done]
	reaction_rows = frappe.get_all(
		"Todo Reaction",
		filters={"todo": ["in", names]},
		fields=["todo", "user", "reaction"],
		limit_page_length=0,
	)
	by_todo = {}
	for rr in reaction_rows:
		by_todo.setdefault(rr["todo"], []).append(rr)

	emails = {r["assigned_to"] for r in done if r.get("assigned_to")}
	emails |= {rr["user"] for rr in reaction_rows}
	name_map = _user_name_map(emails)

	items = []
	for r in done:
		counts = {"clap": 0, "celebrate": 0, "fire": 0, "heart": 0}
		my_reaction = None
		reactors = []
		for rr in by_todo.get(r["name"], []):
			if rr["reaction"] in counts:
				counts[rr["reaction"]] += 1
			if rr["user"] == user:
				my_reaction = rr["reaction"]
			reactors.append((name_map.get(rr["user"]) or {}).get("full_name") or rr["user"])
		assignee = name_map.get(r["assigned_to"], {})
		items.append({
			"name": r["name"],
			"to_do": r["to_do"],
			"project": r["project"],
			"project_name": r["project_name"],
			"assigned_to": r["assigned_to"],
			"assigned_to_name": assignee.get("full_name") or r["assigned_to"],
			"assigned_to_image": assignee.get("user_image"),
			"assigned_to_avatar_config": assignee.get("avatar_config"),
			"completed_at": str(r["completed_at"]),
			"completed_at_human": _humanize_datetime(r["completed_at"]),
			"point": float(r["point"] or 0),
			"reactions": counts,
			"my_reaction": my_reaction,
			"reactors": reactors[:3],
			"total": sum(counts.values()),
			"is_mine": r["assigned_to"] == user,
		})
	return {"items": items}


def _recognition_credit(todo, recipient, reactor, reaction):
	"""Mint (or refresh) a small Recognition Point Ledger row: the assignee earns
	points because a teammate noticed their work. Keyed on (todo, granted_by, source)
	so one reactor credits a given todo at most once. A weekly per-giver cap blocks
	farming. source='Recognition' is off the productivity leaderboard — it feeds the
	Character board. Best-effort: a failure here never breaks the reaction."""
	try:
		settings = frappe.get_cached_doc("Vernon Settings")
		pts = float(settings.recognition_points or 0)
		# ponytail: giver's Feedback credit rides on the Recognition gate below (shared
		# idempotency key + weekly cap). Disabling Recognition (points=0) also disables it;
		# split them out only if the two ever need independent toggles.
		fb_pts = float(settings.feedback_points or 0)
		if pts <= 0 and fb_pts <= 0:
			return
		note = REACTION_LABELS.get(reaction, reaction)
		existing = frappe.db.exists(
			"Point Ledger",
			{"todo": todo, "granted_by": reactor, "source": ["in", ["Recognition", "Feedback"]]},
		)
		if existing:
			# Already credited for this todo — just refresh the note (reaction changed).
			frappe.db.set_value(
				"Point Ledger",
				{"todo": todo, "granted_by": reactor, "source": ["in", ["Recognition", "Feedback"]]},
				"note", note,
			)
			return
		# Anti-farm: cap grants per giver per rolling 7 days (shared by recognition + feedback).
		cap = int(settings.recognition_weekly_cap or 0)
		if cap > 0:
			given = frappe.db.count(
				"Point Ledger",
				{"granted_by": reactor, "source": "Recognition", "credited_on": [">=", add_days(nowdate(), -7)]},
			)
			if given >= cap:
				return
		if pts > 0:
			frappe.get_doc({
				"doctype": "Point Ledger",
				"user": recipient,
				"source": "Recognition",
				"todo": todo,
				"granted_by": reactor,
				"note": note,
				"points_earned": pts,
				"credited_on": now_datetime(),
			}).insert(ignore_permissions=True)
		if fb_pts > 0:
			# The giver earns points for noticing a teammate's work.
			frappe.get_doc({
				"doctype": "Point Ledger",
				"user": reactor,
				"source": "Feedback",
				"todo": todo,
				"granted_by": reactor,
				"note": note,
				"points_earned": fb_pts,
				"credited_on": now_datetime(),
			}).insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(title="recognition credit failed")


def _recognition_remove(todo, reactor):
	"""Claw back both rows a reactor minted on this todo (reaction taken back):
	the recipient's Recognition point and the giver's Feedback point."""
	for row in frappe.get_all(
		"Point Ledger",
		filters={"todo": todo, "granted_by": reactor, "source": ["in", ["Recognition", "Feedback"]]},
		pluck="name",
	):
		frappe.delete_doc("Point Ledger", row, ignore_permissions=True, force=True)


@frappe.whitelist()
def toggle_reaction(todo, reaction):
	"""Upsert/remove the caller's reaction on a todo. Same reaction again removes
	it; a different reaction replaces it; the first reaction notifies the assignee.
	Forbidden on a todo assigned to yourself."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	if reaction not in REACTION_LABELS:
		frappe.throw("Unknown reaction")

	assignee, project_detail = frappe.db.get_value(
		"Project Todo", todo, ["assigned_to", "project_detail"]
	) or (None, None)
	if not project_detail:
		frappe.throw("Todo not found")
	project = frappe.db.get_value("Project Detail", project_detail, "project")
	if project not in _visible_projects():
		frappe.throw("Not permitted", frappe.PermissionError)
	if assignee == user:
		frappe.throw("You can't react to your own work")

	# ponytail: app-level (todo,user) uniqueness via read-then-write; a rapid
	# double-tap before commit could insert two rows. Acceptable for a social
	# counter — add a DB unique index on (todo,user) if it ever matters.
	existing = frappe.get_all(
		"Todo Reaction",
		filters={"todo": todo, "user": user},
		fields=["name", "reaction"],
		limit_page_length=1,
	)
	notify = False
	credited_reaction = None  # reaction to (re)mint/refresh Recognition for, if any
	if existing:
		e = existing[0]
		if e["reaction"] == reaction:
			frappe.delete_doc("Todo Reaction", e["name"], ignore_permissions=True, force=True)
			_recognition_remove(todo, user)  # reaction taken back → claw back the point
		else:
			frappe.db.set_value("Todo Reaction", e["name"], "reaction", reaction)
			credited_reaction = reaction  # row already exists; just refresh the note
	else:
		frappe.get_doc({
			"doctype": "Todo Reaction",
			"todo": todo,
			"user": user,
			"reaction": reaction,
		}).insert(ignore_permissions=True)
		notify = True
		credited_reaction = reaction
	frappe.db.commit()

	if credited_reaction and assignee:
		_recognition_credit(todo, assignee, user, credited_reaction)
		frappe.db.commit()

	if notify:
		actor_name = frappe.db.get_value("User", user, "full_name") or user
		_notify(
			assignee,
			"Kudos",
			f"{actor_name} cheered your work",
			REACTION_LABELS[reaction],
			"Project Todo",
			todo,
			actor=user,
		)

	counts, mine = _reaction_counts(todo, user)
	return {"reactions": counts, "my_reaction": mine, "total": sum(counts.values())}


# --------------------------------------------------------------------------------
# Avatar — customizable 3D avatar config + cosmetic catalog/ownership.
# Ownership = default items + items granted by a redeemed Marketplace Reward.
# The composed PNG snapshot is written to User.user_image (the identity image).
# --------------------------------------------------------------------------------

DEFAULT_SKIN = "#E8B894"
DEFAULT_ACCENT = "#6366F1"



import json as _json

DEFAULT_AVATAR = {"style": "lorelei", "options": {}}
# Keep in sync with frontend src/avatar/styles.ts STYLE_LIST.
ALLOWED_STYLES = ("lorelei", "notionists", "notionistsNeutral", "croodles", "croodlesNeutral", "bigEars", "openPeeps", "doodle")
# Character faces (Dragon Ball × Naruto) — the art IS the avatar. Style id is
# `char:<character>:<form>` (see frontend src/avatar/characters.ts). Prefix-gated
# so new characters/forms need no backend change; a bogus id just renders blank.
def _style_allowed(style):
	return style in ALLOWED_STYLES or (isinstance(style, str) and style.startswith("char:"))

# First-3 free variants per (style, slot); 4th+ are premium. Generated from the
# installed DiceBear v9 enums (same order the frontend introspects).
AVATAR_FREE = {
	"lorelei": {"hair": ["variant48", "variant47", "variant46"], "eyes": ["variant24", "variant23", "variant22"], "eyebrows": ["variant13", "variant12", "variant11"], "mouth": ["happy01", "happy02", "happy03"], "glasses": ["variant01", "variant02", "variant03"], "earrings": ["variant01", "variant02", "variant03"], "nose": ["variant01", "variant02", "variant03"], "hairAccessories": ["flowers"], "beard": ["variant01", "variant02"], "head": ["variant04", "variant03", "variant02"], "freckles": ["variant01"]},
	"adventurer": {"hair": ["short16", "short15", "short14"], "eyes": ["variant26", "variant25", "variant24"], "eyebrows": ["variant10", "variant09", "variant08"], "mouth": ["variant30", "variant29", "variant28"], "glasses": ["variant01", "variant02", "variant03"], "earrings": ["variant06", "variant01", "variant02"], "features": ["mustache", "blush", "birthmark"]},
	"notionists": {"hair": ["variant63", "variant62", "variant61", "variant59", "variant57"], "eyes": ["variant05", "variant04", "variant03"], "brows": ["variant13", "variant12", "variant11"], "lips": ["variant30", "variant29", "variant28"], "glasses": ["variant11", "variant10", "variant09"], "nose": ["variant20", "variant19", "variant18"], "beard": ["variant12", "variant11", "variant10"], "body": ["variant25", "variant24", "variant23"], "bodyIcon": ["electric", "saturn", "galaxy"], "gesture": ["wavePointLongArms", "waveOkLongArms", "waveLongArms"]},
}
PREMIUM_PRICE = 50  # ponytail: fallback only; live value from Avatar Gamification Settings


def _gami_settings():
	return frappe.get_cached_doc("Avatar Gamification Settings")


def _premium_price():
	try:
		v = _gami_settings().premium_price
		return float(v) if v else 50.0
	except Exception:
		return 50.0


def _lifetime_points(user):
	return float(frappe.db.sql("select coalesce(sum(points_earned),0) from `tabPoint Ledger` where user=%s", user)[0][0] or 0)


def _grant_points(user, amount, source):
	if not amount:
		return
	frappe.get_doc({"doctype": "Point Ledger", "user": user, "role": "Assignee",
		"points_earned": float(amount), "source": source, "credited_on": now_datetime()}).insert(ignore_permissions=True)


def _grant_asset(user, asset_name):
	if not asset_name or not frappe.db.exists("Avatar Asset", asset_name):
		return
	if frappe.db.exists("Avatar Unlock", {"user": user, "style": "_asset", "option_value": asset_name}):
		return
	atype = frappe.db.get_value("Avatar Asset", asset_name, "asset_type")
	frappe.get_doc({"doctype": "Avatar Unlock", "user": user, "style": "_asset",
		"slot": (atype or "").lower(), "option_value": asset_name, "cost": 0, "unlocked_on": now_datetime()}).insert(ignore_permissions=True)


def _has_claim(user, claim_type, claim_ref):
	return bool(frappe.db.exists("Avatar Reward Claim", {"user": user, "claim_type": claim_type, "claim_ref": str(claim_ref)}))


def _record_claim(user, claim_type, claim_ref):
	try:
		frappe.get_doc({"doctype": "Avatar Reward Claim", "user": user, "claim_type": claim_type, "claim_ref": str(claim_ref)}).insert(ignore_permissions=True)
		return True
	except frappe.exceptions.DuplicateEntryError:
		return False


def _is_free(style, slot, value):
	"""A value is free iff it's a first-3 variant of a premium-checked slot.
	Slots not in the map (colors, *Probability) are always free."""
	slot_free = AVATAR_FREE.get(style, {}).get(slot)
	if slot_free is None:
		return True
	return value in slot_free


def _avatar_owned_options(user):
	rows = frappe.get_all("Avatar Unlock", filters={"user": user},
		fields=["style", "slot", "option_value"])
	return {(r["style"], r["slot"], r["option_value"]) for r in rows}


@frappe.whitelist()
def buy_avatar_option(style, slot, value):
	"""Unlock one premium variant for PREMIUM_PRICE. Row-locked per user so
	concurrent buys can't overspend."""
	user = frappe.session.user
	if _is_free(style, slot, value):
		frappe.throw("That option is free", frappe.ValidationError)
	if frappe.db.exists("Avatar Unlock", {"user": user, "style": style, "slot": slot, "option_value": value}):
		_, _, bal = _user_balance(user)
		return {"balance": bal}
	lock_key = f"vernon_spend:{user}"
	if not frappe.db.sql("select get_lock(%s, 10)", lock_key)[0][0]:
		frappe.throw("Busy, please retry", frappe.ValidationError)
	try:
		if frappe.db.exists("Avatar Unlock", {"user": user, "style": style, "slot": slot, "option_value": value}):
			_, _, bal = _user_balance(user)
			return {"balance": bal}
		_, _, balance = _user_balance(user)
		if balance < _premium_price():
			frappe.throw(f"Not enough points — you need {int(round(_premium_price()))}, you have {int(round(balance))}.", frappe.ValidationError)
		frappe.get_doc({
			"doctype": "Avatar Unlock", "user": user, "style": style, "slot": slot,
			"option_value": value, "cost": _premium_price(), "unlocked_on": now_datetime(),
		}).insert(ignore_permissions=True)
		_, _, new_balance = _user_balance(user)
		return {"balance": new_balance}
	finally:
		frappe.db.sql("select release_lock(%s)", lock_key)



def _asset_owned(user):
	owned = set(frappe.get_all("Avatar Asset", filters={"is_default": 1, "active": 1}, pluck="asset_name"))
	for v in frappe.get_all("Avatar Unlock", filters={"user": user, "style": "_asset"}, pluck="option_value"):
		owned.add(v)
	return owned


@frappe.whitelist()
def buy_avatar_asset(asset_name):
	user = frappe.session.user
	a = frappe.db.get_value("Avatar Asset", asset_name, ["asset_type", "is_default", "price", "active", "earn_only"], as_dict=True)
	if not a or not a["active"]:
		frappe.throw("Unavailable", frappe.ValidationError)
	if a["is_default"]:
		frappe.throw("That item is free", frappe.ValidationError)
	if a["earn_only"]:
		frappe.throw("Earned only — complete its set to unlock.", frappe.ValidationError)
	if frappe.db.exists("Avatar Unlock", {"user": user, "style": "_asset", "option_value": asset_name}):
		_, _, bal = _user_balance(user); return {"balance": bal}
	lock_key = f"vernon_spend:{user}"
	if not frappe.db.sql("select get_lock(%s, 10)", lock_key)[0][0]:
		frappe.throw("Busy, please retry", frappe.ValidationError)
	try:
		if frappe.db.exists("Avatar Unlock", {"user": user, "style": "_asset", "option_value": asset_name}):
			_, _, bal = _user_balance(user); return {"balance": bal}
		cost = float(a["price"] or 0)
		_, _, balance = _user_balance(user)
		if balance < cost:
			frappe.throw(f"Not enough points — you need {int(round(cost))}, you have {int(round(balance))}.", frappe.ValidationError)
		frappe.get_doc({"doctype": "Avatar Unlock", "user": user, "style": "_asset",
			"slot": (a["asset_type"] or "").lower(), "option_value": asset_name,
			"cost": cost, "unlocked_on": now_datetime()}).insert(ignore_permissions=True)
		completed = _maybe_complete_set(user, asset_name)
		_, _, nb = _user_balance(user); return {"balance": nb, "completed": completed}
	finally:
		frappe.db.sql("select release_lock(%s)", lock_key)


# ── Task Crate (work-earned gacha) ───────────────────────────────────────────
# Keys are minted by REAL work (credited Todo points), tracked in parallel to the
# spendable balance — opening a crate NEVER spends points/pay and always yields a
# guaranteed NEW cosmetic (no wager, no dupes). Daily cap paces it.
CRATE_KEY_COST = 3000   # credited Todo points earned per crate key (tunable)
CRATE_DAILY_CAP = 5     # max crate opens per user per day


def _lifetime_todo_points(user):
	return float(frappe.db.sql(
		"select coalesce(sum(points_earned),0) from `tabPoint Ledger` "
		"where user=%s and coalesce(source,'Todo')='Todo'", user)[0][0])


def _crate_opened_total(user):
	return frappe.db.count("Avatar Reward Claim", {"user": user, "claim_type": "task_crate"})


def _crate_opened_today(user):
	return int(frappe.db.sql(
		"select count(*) from `tabAvatar Reward Claim` "
		"where user=%s and claim_type='task_crate' and date(creation)=%s",
		(user, nowdate()))[0][0])


def _crate_pool(user):
	"""Active, non-default, non-earn-only assets the user does not yet own."""
	owned = _asset_owned(user)
	return [a for a in frappe.get_all("Avatar Asset", filters={"active": 1, "is_default": 0, "earn_only": 0},
		fields=["asset_name", "asset_type", "emoji", "icon", "image", "gradient"])
		if a["asset_name"] not in owned]


@frappe.whitelist()
def get_crate_status():
	user = frappe.session.user
	pts = _lifetime_todo_points(user)
	earned = int(pts // CRATE_KEY_COST)
	opened = _crate_opened_total(user)
	available = max(0, earned - opened)
	into = pts - earned * CRATE_KEY_COST
	return {
		"keys": available,
		"key_cost": CRATE_KEY_COST,
		"progress": into,
		"progress_pct": int(round(into / CRATE_KEY_COST * 100)),
		"daily_cap": CRATE_DAILY_CAP,
		"opened_today": _crate_opened_today(user),
		"remaining": len(_crate_pool(user)),
	}


@frappe.whitelist()
def open_task_crate():
	"""Spend one work-earned key → grant a random NEW cosmetic. Row-locked so
	concurrent opens can't double-spend a key."""
	import random
	user = frappe.session.user
	lock_key = f"vernon_spend:{user}"
	if not frappe.db.sql("select get_lock(%s, 10)", lock_key)[0][0]:
		frappe.throw("Busy, please retry", frappe.ValidationError)
	try:
		earned = int(_lifetime_todo_points(user) // CRATE_KEY_COST)
		opened = _crate_opened_total(user)
		if earned - opened <= 0:
			frappe.throw(f"No keys yet — earn {CRATE_KEY_COST} task points per key.", frappe.ValidationError)
		if _crate_opened_today(user) >= CRATE_DAILY_CAP:
			frappe.throw(f"Daily crate limit reached ({CRATE_DAILY_CAP}). Come back tomorrow.", frappe.ValidationError)
		pool = _crate_pool(user)
		if not pool:
			frappe.throw("You've collected every cosmetic! 🎉", frappe.ValidationError)
		pick = random.choice(pool)
		_grant_asset(user, pick["asset_name"])
		_record_claim(user, "task_crate", opened)  # claim_ref = key index (unique under lock)
		completed = _maybe_complete_set(user, pick["asset_name"])
		return {"asset": pick, "keys_left": earned - opened - 1, "remaining": len(pool) - 1, "completed": completed}
	finally:
		frappe.db.sql("select release_lock(%s)", lock_key)


def grandfather_avatar_unlocks():
	"""One-time: give every user a free (cost=0) unlock for the premium variants
	already in their saved config, so the freemium rule doesn't block re-saving
	avatars they built when everything was free."""
	import json as _json
	created = 0
	for ua in frappe.get_all("User Avatar", fields=["user", "config_json"]):
		if not ua.get("config_json"):
			continue
		try:
			cfg = _json.loads(ua["config_json"])
		except Exception:
			continue
		style = cfg.get("style")
		options = cfg.get("options") or {}
		for slot, vals in options.items():
			if slot not in AVATAR_FREE.get(style, {}):
				continue
			for v in (vals if isinstance(vals, list) else [vals]):
				if _is_free(style, slot, v):
					continue
				if frappe.db.exists("Avatar Unlock", {"user": ua["user"], "style": style, "slot": slot, "option_value": v}):
					continue
				frappe.get_doc({
					"doctype": "Avatar Unlock", "user": ua["user"], "style": style,
					"slot": slot, "option_value": v, "cost": 0, "unlocked_on": now_datetime(),
				}).insert(ignore_permissions=True)
				created += 1
	frappe.db.commit()
	return {"granted": created}


def _my_avatar_config(user):
	raw = frappe.db.get_value("User Avatar", {"user": user}, "config_json")
	if not raw:
		return {"style": DEFAULT_AVATAR["style"], "options": {}}
	try:
		cfg = _json.loads(raw)
	except Exception:
		return {"style": DEFAULT_AVATAR["style"], "options": {}}
	if not _style_allowed(cfg.get("style")):
		cfg["style"] = DEFAULT_AVATAR["style"]
	if not isinstance(cfg.get("options"), dict):
		cfg["options"] = {}
	return cfg


@frappe.whitelist()
def get_avatar_catalog():
	"""Freemium avatar catalog: balance, price, unlocked options, current config."""
	user = frappe.session.user
	_, _, balance = _user_balance(user)
	unlocked = [
		{"style": s, "slot": sl, "option_value": v}
		for (s, sl, v) in _avatar_owned_options(user)
	]
	owned_assets = _asset_owned(user)
	assets = frappe.get_all("Avatar Asset", filters={"active": 1},
		fields=["asset_name", "asset_type", "emoji", "icon", "image", "gradient", "anchor", "set_name", "earn_only", "is_default", "price"],
		order_by="asset_type asc, asset_name asc")
	for a in assets:
		a["owned"] = (a["asset_name"] in owned_assets) or bool(a["is_default"])
		a["price"] = None if a["owned"] else float(a["price"] or 0)
	# Collection sets: owned N / total M per named set (informational).
	tot, own = {}, {}
	for a in assets:
		s = a.get("set_name")
		if not s:
			continue
		tot[s] = tot.get(s, 0) + 1
		own[s] = own.get(s, 0) + (1 if a["owned"] else 0)
	sets = [{"name": s, "owned": own[s], "total": tot[s]} for s in sorted(tot)]
	return {
		"free_count": 3, "price": _premium_price(), "unlocked": unlocked,
		"my": _my_avatar_config(user), "balance": balance,
		"assets": assets, "sets": sets,
	}


@frappe.whitelist()
def get_my_avatar():
	return _my_avatar_config(frappe.session.user)


@frappe.whitelist()
def save_my_avatar(config_json, snapshot_dataurl=None):
	"""Persist the caller's DiceBear config. Any selected option that is a premium
	Avatar Item must be owned, or the save is rejected."""
	user = frappe.session.user
	try:
		cfg = _json.loads(config_json) if isinstance(config_json, str) else config_json
	except Exception:
		frappe.throw("Invalid avatar config", frappe.ValidationError)
	if not isinstance(cfg, dict):
		frappe.throw("Invalid avatar config", frappe.ValidationError)
	style = cfg.get("style")
	if not _style_allowed(style):
		frappe.throw("Unknown avatar style", frappe.ValidationError)
	options = cfg.get("options") or {}
	if not isinstance(options, dict):
		frappe.throw("Invalid avatar options", frappe.ValidationError)

	owned = _avatar_owned_options(user)
	for slot, vals in options.items():
		if slot not in AVATAR_FREE.get(style, {}):
			continue  # color/probability/unmapped slots are always free
		values = vals if isinstance(vals, list) else [vals]
		for v in values:
			if not _is_free(style, slot, v) and (style, slot, v) not in owned:
				frappe.throw("Unlock that item first", frappe.ValidationError)

	asset_owned = _asset_owned(user)
	def _check_asset(name, want_type):
		if not name:
			return None
		atype = frappe.db.get_value("Avatar Asset", name, "asset_type")
		if atype != want_type:
			frappe.throw("Unknown item", frappe.ValidationError)
		if name not in asset_owned:
			frappe.throw("Unlock that item first", frappe.ValidationError)
		return name
	scene = _check_asset(cfg.get("scene"), "Scene")
	feat = _check_asset(cfg.get("featured_collectible"), "Collectible")
	props = [p for p in (cfg.get("props") or []) if _check_asset(p, "Prop")]

	clean = {"style": style, "options": options}
	clean["scene"] = scene; clean["props"] = props; clean["featured_collectible"] = feat
	name = frappe.db.exists("User Avatar", {"user": user})
	doc = frappe.get_doc("User Avatar", name) if name else frappe.new_doc("User Avatar")
	doc.user = user
	doc.config_json = _json.dumps(clean)

	url = None
	if snapshot_dataurl:
		url = _save_snapshot(user, snapshot_dataurl)
		if url:
			doc.snapshot = url
	doc.base = doc.hat = doc.face = None  # clear deprecated dangling links (old GLB items were deleted)
	doc.save(ignore_permissions=True)
	if url:
		frappe.db.set_value("User", user, "user_image", url)
	return _my_avatar_config(user)


def _save_snapshot(user, dataurl):
	"""Decode a `data:image/png;base64,...` URL, save as a public File, return its
	URL. Returns None on malformed input so the config still saves. Prunes the
	user's prior avatar snapshots so repeated saves don't leak File rows/disk."""
	import base64
	from frappe.utils.file_manager import save_file

	try:
		header, b64 = dataurl.split(",", 1)
		if "image/png" not in header:
			return None
		content = base64.b64decode(b64)
		if len(content) > MAX_IMAGE_BYTES:
			frappe.throw("Snapshot too large", frappe.ValidationError)
		prefix = f"avatar-{frappe.scrub(user)}"
		saved = save_file(f"{prefix}.png", content, "User", user, is_private=0)
		# Prune older snapshots for this user (best-effort; never lose the new url).
		try:
			old = frappe.get_all("File", filters={
				"attached_to_doctype": "User",
				"attached_to_name": user,
				"file_name": ["like", f"{prefix}%"],
				"name": ["!=", saved.name],
			}, pluck="name")
			for f in old:
				frappe.delete_doc("File", f, ignore_permissions=True, force=True)
		except Exception:
			pass
		return saved.file_url
	except frappe.ValidationError:
		raise
	except Exception:
		return None


# --------------------------------------------------------------------------------
# Avatar catalog seed
# Premium DiceBear attributes sold in the marketplace. style/slot/value are real
# DiceBear v9 variant ids. is_default items are free for everyone.
# --------------------------------------------------------------------------------

def seed_avatar_catalog():
	"""Freemium model uses rule-based premium + Avatar Unlock — no premium
	Avatar Item rows. Remove any previously-seeded ones + their rewards."""
	removed = 0
	for nm in frappe.get_all("Avatar Item", pluck="name"):
		for rw in frappe.get_all("Marketplace Reward", filters={"avatar_item": nm}, pluck="name"):
			frappe.delete_doc("Marketplace Reward", rw, ignore_permissions=True, force=True)
		frappe.delete_doc("Avatar Item", nm, ignore_permissions=True, force=True)
		removed += 1
	frappe.db.commit()
	return {"removed_items": removed}


def _assigned_allocations_map(names):
	"""{todo_name: [{date, minutes, note}]} for the leader assigned allocation."""
	out = {n: [] for n in names}
	if not names:
		return out
	rows = frappe.get_all(
		"Project Todo Assigned Allocation",
		filters={"parent": ["in", names], "parenttype": "Project Todo"},
		fields=["parent", "allocation_date", "estimated_minutes", "note"],
		order_by="allocation_date asc",
		limit_page_length=0,
	)
	for r in rows:
		out.setdefault(r["parent"], []).append({
			"date": str(r["allocation_date"]) if r["allocation_date"] else None,
			"minutes": r["estimated_minutes"] or 0,
			"note": r.get("note") or "",
		})
	return out


@frappe.whitelist()
def set_assigned_allocation(project_item, allocations):
	"""Leader-only: replace a todo's authoritative assigned allocation. Must sum
	to the estimate. `allocations` is a JSON list of {date, minutes, note}."""
	try:
		user = frappe.session.user
		if not frappe.db.exists("Project Todo", project_item):
			return {"status": "error", "message": "Task not found."}
		todo = frappe.get_doc("Project Todo", project_item)
		project_detail = frappe.get_value("Project Todo", project_item, "project_detail")
		detail_project = frappe.get_value("Project Detail", project_detail, "project")
		leader = frappe.get_value("Project", detail_project, "project_leader")
		is_sm = "System Manager" in frappe.get_roles(user)
		if not (is_sm or user == leader):
			return {"status": "error", "message": "Only the project leader can set the assigned allocation."}
		if todo.status in ("🟠 Done", "✅ Completed"):
			return {"status": "error", "message": "Assigned allocation is locked once the task is Done or Completed."}

		if isinstance(allocations, str):
			allocations = json.loads(allocations or "[]")
		clean = [a for a in (allocations or []) if (a.get("date") or a.get("allocation_date"))]
		err = _alloc_sum_error(clean, todo.estimated)
		if err:
			return {"status": "error", "message": err}

		todo.set("assigned_allocation", [])
		for a in clean:
			todo.append("assigned_allocation", {
				"allocation_date": a.get("date") or a.get("allocation_date"),
				"estimated_minutes": int(a.get("minutes") or a.get("estimated_minutes") or 0),
				"note": (a.get("note") or "").strip(),
			})
		todo.save(ignore_permissions=True)
		frappe.db.commit()
		return {"status": "ok", "message": "Assigned allocation saved.",
			"allocations": _assigned_allocations_map([project_item]).get(project_item, [])}
	except Exception as e:
		msg = frappe.utils.strip_html(str(e)).strip() or "Could not save the assigned allocation."
		return {"status": "error", "message": msg}


# --------------------------------------------------------------------------------
# Avatar Asset seed — scenes (CSS gradient) + props/collectibles (emoji).
# --------------------------------------------------------------------------------
from urllib.parse import quote


def _scene_bg(svg, sky):
	# ponytail: fully encode SVG so data-URI is valid CSS (spaces, <>, #, etc.)
	data = "data:image/svg+xml," + quote(svg, safe="")
	return f'url("{data}") bottom/100% 55% no-repeat, {sky}'


def _svg_uri(svg):
	# Self-contained image src for the Avatar Asset `image` field (no hosting needed).
	return "data:image/svg+xml," + quote(svg, safe="")


AVATAR_ASSETS = [
	{"asset_name": "Sky", "asset_type": "Scene", "gradient": "linear-gradient(180deg,#b6e3f4,#eef7ff)", "is_default": 1},
	{"asset_name": "Sunset", "asset_type": "Scene", "gradient": "linear-gradient(180deg,#ffafbd,#ffc3a0)", "is_default": 1},
	{"asset_name": "Space", "asset_type": "Scene", "gradient": "linear-gradient(180deg,#0f2027,#2c5364)"},
	{"asset_name": "Forest", "asset_type": "Scene", "gradient": "linear-gradient(180deg,#5a3f37,#2c7744)"},
	{"asset_name": "Candy", "asset_type": "Scene", "gradient": "linear-gradient(180deg,#ffd1ff,#fad0c4)"},
	{"asset_name": "Top Hat", "asset_type": "Prop", "emoji": "", "icon": "Crown", "anchor": "top", "is_default": 1},
	{"asset_name": "Crown", "asset_type": "Prop", "emoji": "", "icon": "Crown", "anchor": "top"},
	{"asset_name": "Cap", "asset_type": "Prop", "emoji": "", "icon": "HardHat", "anchor": "top"},
	{"asset_name": "Star Badge", "asset_type": "Prop", "emoji": "", "icon": "Star", "anchor": "corner", "is_default": 1},
	{"asset_name": "Fire Badge", "asset_type": "Prop", "emoji": "", "icon": "Flame", "anchor": "corner"},
	{"asset_name": "Gem Badge", "asset_type": "Prop", "emoji": "", "icon": "Gem", "anchor": "corner"},
	{"asset_name": "Red Car", "asset_type": "Collectible", "emoji": "", "icon": "Car"},
	{"asset_name": "Race Car", "asset_type": "Collectible", "emoji": "", "icon": "CarFront"},
	{"asset_name": "Sword", "asset_type": "Collectible", "emoji": "", "icon": "Sword"},
	{"asset_name": "Shield", "asset_type": "Collectible", "emoji": "", "icon": "Shield"},
	{"asset_name": "Bow", "asset_type": "Collectible", "emoji": "", "icon": "Target"},
	{"asset_name": "Dragon", "asset_type": "Collectible", "emoji": "", "icon": "Flame"},
	{"asset_name": "Unicorn", "asset_type": "Collectible", "emoji": "", "icon": "Sparkles"},
	{"asset_name": "Rocket", "asset_type": "Collectible", "emoji": "", "icon": "Rocket"},
	# more collectibles (cars / weapons / pets / flex)
	{"asset_name": "SUV", "asset_type": "Collectible", "emoji": "", "icon": "Truck"},
	{"asset_name": "Police Car", "asset_type": "Collectible", "emoji": "", "icon": "Siren"},
	{"asset_name": "Motorcycle", "asset_type": "Collectible", "emoji": "", "icon": "Bike"},
	{"asset_name": "UFO", "asset_type": "Collectible", "emoji": "", "icon": "Rocket"},
	{"asset_name": "Pistol", "asset_type": "Collectible", "emoji": "", "icon": "Crosshair"},
	{"asset_name": "Axe", "asset_type": "Collectible", "emoji": "", "icon": "Axe"},
	{"asset_name": "Trident", "asset_type": "Collectible", "emoji": "", "icon": "Swords"},
	{"asset_name": "Wolf", "asset_type": "Collectible", "emoji": "", "icon": "Dog"},
	{"asset_name": "Lion", "asset_type": "Collectible", "emoji": "", "icon": "Cat"},
	{"asset_name": "Tiger", "asset_type": "Collectible", "emoji": "", "icon": "Cat"},
	{"asset_name": "Eagle", "asset_type": "Collectible", "emoji": "", "icon": "Bird"},
	{"asset_name": "Octopus", "asset_type": "Collectible", "emoji": "", "icon": "Fish"},
	{"asset_name": "Trophy", "asset_type": "Collectible", "emoji": "", "icon": "Trophy", "is_default": 1},
	{"asset_name": "Gold Medal", "asset_type": "Collectible", "emoji": "", "icon": "Medal"},
	{"asset_name": "Money Bag", "asset_type": "Collectible", "emoji": "", "icon": "Coins"},
	{"asset_name": "Diamond", "asset_type": "Collectible", "emoji": "", "icon": "Gem"},
	{"asset_name": "Rainbow", "asset_type": "Collectible", "emoji": "", "icon": "Rainbow", "is_default": 1},
	# 50 new collectibles
	{"asset_name": "Bus", "asset_type": "Collectible", "emoji": "", "icon": "Bus"},
	{"asset_name": "Ship", "asset_type": "Collectible", "emoji": "", "icon": "Ship"},
	{"asset_name": "Sailboat", "asset_type": "Collectible", "emoji": "", "icon": "Sailboat"},
	{"asset_name": "Ambulance", "asset_type": "Collectible", "emoji": "", "icon": "Ambulance"},
	{"asset_name": "Fuel Can", "asset_type": "Collectible", "emoji": "", "icon": "Fuel"},
	{"asset_name": "Rabbit", "asset_type": "Collectible", "emoji": "", "icon": "Rabbit"},
	{"asset_name": "Turtle", "asset_type": "Collectible", "emoji": "", "icon": "Turtle"},
	{"asset_name": "Squirrel", "asset_type": "Collectible", "emoji": "", "icon": "Squirrel"},
	{"asset_name": "Snail", "asset_type": "Collectible", "emoji": "", "icon": "Snail"},
	{"asset_name": "Bug", "asset_type": "Collectible", "emoji": "", "icon": "Bug"},
	{"asset_name": "Paw Print", "asset_type": "Collectible", "emoji": "", "icon": "PawPrint"},
	{"asset_name": "Deciduous Tree", "asset_type": "Collectible", "emoji": "", "icon": "TreeDeciduous"},
	{"asset_name": "Mountain", "asset_type": "Collectible", "emoji": "", "icon": "Mountain"},
	{"asset_name": "Snowy Mountain", "asset_type": "Collectible", "emoji": "", "icon": "MountainSnow"},
	{"asset_name": "Sunrise", "asset_type": "Collectible", "emoji": "", "icon": "Sunrise"},
	{"asset_name": "Sunset", "asset_type": "Collectible", "emoji": "", "icon": "Sunset"},
	{"asset_name": "Waves", "asset_type": "Collectible", "emoji": "", "icon": "Waves"},
	{"asset_name": "Droplets", "asset_type": "Collectible", "emoji": "", "icon": "Droplets"},
	{"asset_name": "Banknote", "asset_type": "Collectible", "emoji": "", "icon": "Banknote"},
	{"asset_name": "Dollar Sign", "asset_type": "Collectible", "emoji": "", "icon": "DollarSign"},
	{"asset_name": "Gift Box", "asset_type": "Collectible", "emoji": "", "icon": "Gift"},
	{"asset_name": "Piggy Bank", "asset_type": "Collectible", "emoji": "", "icon": "PiggyBank"},
	{"asset_name": "Wallet", "asset_type": "Collectible", "emoji": "", "icon": "Wallet"},
	{"asset_name": "Gamepad", "asset_type": "Collectible", "emoji": "", "icon": "Gamepad2"},
	{"asset_name": "Joystick", "asset_type": "Collectible", "emoji": "", "icon": "Joystick"},
	{"asset_name": "Dice", "asset_type": "Collectible", "emoji": "", "icon": "Dices"},
	{"asset_name": "Puzzle Piece", "asset_type": "Collectible", "emoji": "", "icon": "Puzzle"},
	{"asset_name": "Robot", "asset_type": "Collectible", "emoji": "", "icon": "Bot"},
	{"asset_name": "CPU Chip", "asset_type": "Collectible", "emoji": "", "icon": "Cpu"},
	{"asset_name": "Battery", "asset_type": "Collectible", "emoji": "", "icon": "Battery"},
	{"asset_name": "Camera", "asset_type": "Collectible", "emoji": "", "icon": "Camera"},
	{"asset_name": "Film Reel", "asset_type": "Collectible", "emoji": "", "icon": "Film"},
	{"asset_name": "Palette", "asset_type": "Collectible", "emoji": "", "icon": "Palette"},
	{"asset_name": "Book", "asset_type": "Collectible", "emoji": "", "icon": "Book"},
	{"asset_name": "Globe", "asset_type": "Collectible", "emoji": "", "icon": "Globe"},
	{"asset_name": "Tent", "asset_type": "Collectible", "emoji": "", "icon": "Tent"},
	{"asset_name": "Glasses", "asset_type": "Collectible", "emoji": "", "icon": "Glasses"},
	{"asset_name": "Watch", "asset_type": "Collectible", "emoji": "", "icon": "Watch"},
	{"asset_name": "Backpack", "asset_type": "Collectible", "emoji": "", "icon": "Backpack"},
	{"asset_name": "Cake", "asset_type": "Collectible", "emoji": "", "icon": "Cake"},
	{"asset_name": "Coffee", "asset_type": "Collectible", "emoji": "", "icon": "Coffee"},
	{"asset_name": "Pizza", "asset_type": "Collectible", "emoji": "", "icon": "Pizza"},
	{"asset_name": "Ice Cream", "asset_type": "Collectible", "emoji": "", "icon": "IceCream"},
	{"asset_name": "Cookie", "asset_type": "Collectible", "emoji": "", "icon": "Cookie"},
	{"asset_name": "Apple", "asset_type": "Collectible", "emoji": "", "icon": "Apple"},
	{"asset_name": "Beer", "asset_type": "Collectible", "emoji": "", "icon": "Beer"},
	{"asset_name": "Wine", "asset_type": "Collectible", "emoji": "", "icon": "Wine"},
	{"asset_name": "Soup", "asset_type": "Collectible", "emoji": "", "icon": "Soup"},
	{"asset_name": "Beef", "asset_type": "Collectible", "emoji": "", "icon": "Beef"},
	{"asset_name": "Banana", "asset_type": "Collectible", "emoji": "", "icon": "Banana"},
	# more props (converted + new)
	{"asset_name": "Wizard Hat", "asset_type": "Prop", "emoji": "", "icon": "Wand2", "anchor": "top"},
	{"asset_name": "Graduation Cap", "asset_type": "Prop", "emoji": "", "icon": "GraduationCap", "anchor": "top"},
	{"asset_name": "Halo", "asset_type": "Prop", "emoji": "", "icon": "Sun", "anchor": "top"},
	{"asset_name": "Heart Badge", "asset_type": "Prop", "emoji": "", "icon": "Heart", "anchor": "corner"},
	{"asset_name": "Lightning Badge", "asset_type": "Prop", "emoji": "", "icon": "Zap", "anchor": "corner"},
	# 50 new props — top (~30)
	{"asset_name": "Sparkle Hat", "asset_type": "Prop", "emoji": "", "icon": "Sparkles", "anchor": "top"},
	{"asset_name": "Star Hat", "asset_type": "Prop", "emoji": "", "icon": "Star", "anchor": "top"},
	{"asset_name": "Sun Crown", "asset_type": "Prop", "emoji": "", "icon": "Sun", "anchor": "top"},
	{"asset_name": "Moon Crown", "asset_type": "Prop", "emoji": "", "icon": "Moon", "anchor": "top"},
	{"asset_name": "Cloud Crown", "asset_type": "Prop", "emoji": "", "icon": "Cloud", "anchor": "top"},
	{"asset_name": "Snow Crown", "asset_type": "Prop", "emoji": "", "icon": "Snowflake", "anchor": "top"},
	{"asset_name": "Feather Crown", "asset_type": "Prop", "emoji": "", "icon": "Feather", "anchor": "top"},
	{"asset_name": "Leaf Crown", "asset_type": "Prop", "emoji": "", "icon": "Leaf", "anchor": "top"},
	{"asset_name": "Flower Crown", "asset_type": "Prop", "emoji": "", "icon": "Flower", "anchor": "top"},
	{"asset_name": "Bird Perch", "asset_type": "Prop", "emoji": "", "icon": "Bird", "anchor": "top"},
	{"asset_name": "Bright Idea", "asset_type": "Prop", "emoji": "", "icon": "Lightbulb", "anchor": "top"},
	{"asset_name": "Music Crown", "asset_type": "Prop", "emoji": "", "icon": "Music", "anchor": "top"},
	{"asset_name": "Bell Crown", "asset_type": "Prop", "emoji": "", "icon": "Bell", "anchor": "top"},
	{"asset_name": "Anchor Crown", "asset_type": "Prop", "emoji": "", "icon": "Anchor", "anchor": "top"},
	{"asset_name": "Rocket Hat", "asset_type": "Prop", "emoji": "", "icon": "Rocket", "anchor": "top"},
	{"asset_name": "Plane Hat", "asset_type": "Prop", "emoji": "", "icon": "Plane", "anchor": "top"},
	{"asset_name": "Umbrella Hat", "asset_type": "Prop", "emoji": "", "icon": "Umbrella", "anchor": "top"},
	{"asset_name": "Cat Ears", "asset_type": "Prop", "emoji": "", "icon": "Cat", "anchor": "top"},
	{"asset_name": "Brain Crown", "asset_type": "Prop", "emoji": "", "icon": "Brain", "anchor": "top"},
	{"asset_name": "Atom Crown", "asset_type": "Prop", "emoji": "", "icon": "Atom", "anchor": "top"},
	{"asset_name": "Sprout Hat", "asset_type": "Prop", "emoji": "", "icon": "Sprout", "anchor": "top"},
	{"asset_name": "Pine Crown", "asset_type": "Prop", "emoji": "", "icon": "TreePine", "anchor": "top"},
	{"asset_name": "Rainbow Hat", "asset_type": "Prop", "emoji": "", "icon": "Rainbow", "anchor": "top"},
	{"asset_name": "Wind Veil", "asset_type": "Prop", "emoji": "", "icon": "Wind", "anchor": "top"},
	{"asset_name": "Compass Crown", "asset_type": "Prop", "emoji": "", "icon": "Compass", "anchor": "top"},
	{"asset_name": "Gem Crown", "asset_type": "Prop", "emoji": "", "icon": "Gem", "anchor": "top"},
	{"asset_name": "Flame Crown", "asset_type": "Prop", "emoji": "", "icon": "Flame", "anchor": "top"},
	{"asset_name": "Wand Hat", "asset_type": "Prop", "emoji": "", "icon": "Wand2", "anchor": "top"},
	{"asset_name": "Zap Crown", "asset_type": "Prop", "emoji": "", "icon": "Zap", "anchor": "top"},
	{"asset_name": "Heart Crown", "asset_type": "Prop", "emoji": "", "icon": "Heart", "anchor": "top"},
	# new props — corner (~20)
	{"asset_name": "Award Badge", "asset_type": "Prop", "emoji": "", "icon": "Award", "anchor": "corner"},
	{"asset_name": "Check Badge", "asset_type": "Prop", "emoji": "", "icon": "BadgeCheck", "anchor": "corner"},
	{"asset_name": "Shield Badge", "asset_type": "Prop", "emoji": "", "icon": "Shield", "anchor": "corner"},
	{"asset_name": "Shield Star", "asset_type": "Prop", "emoji": "", "icon": "ShieldCheck", "anchor": "corner"},
	{"asset_name": "Thumbs Up", "asset_type": "Prop", "emoji": "", "icon": "ThumbsUp", "anchor": "corner"},
	{"asset_name": "Smile Badge", "asset_type": "Prop", "emoji": "", "icon": "Smile", "anchor": "corner"},
	{"asset_name": "Medal Pin", "asset_type": "Prop", "emoji": "", "icon": "Medal", "anchor": "corner"},
	{"asset_name": "Trophy Pin", "asset_type": "Prop", "emoji": "", "icon": "Trophy", "anchor": "corner"},
	{"asset_name": "Bookmark Pin", "asset_type": "Prop", "emoji": "", "icon": "Bookmark", "anchor": "corner"},
	{"asset_name": "Tag Pin", "asset_type": "Prop", "emoji": "", "icon": "Tag", "anchor": "corner"},
	{"asset_name": "Flag Pin", "asset_type": "Prop", "emoji": "", "icon": "Flag", "anchor": "corner"},
	{"asset_name": "Eye Pin", "asset_type": "Prop", "emoji": "", "icon": "Eye", "anchor": "corner"},
	{"asset_name": "Skull Pin", "asset_type": "Prop", "emoji": "", "icon": "Skull", "anchor": "corner"},
	{"asset_name": "Ghost Pin", "asset_type": "Prop", "emoji": "", "icon": "Ghost", "anchor": "corner"},
	{"asset_name": "Key Pin", "asset_type": "Prop", "emoji": "", "icon": "Key", "anchor": "corner"},
	{"asset_name": "Lock Pin", "asset_type": "Prop", "emoji": "", "icon": "Lock", "anchor": "corner"},
	{"asset_name": "Diamond Pin", "asset_type": "Prop", "emoji": "", "icon": "Diamond", "anchor": "corner"},
	{"asset_name": "Bomb Pin", "asset_type": "Prop", "emoji": "", "icon": "Bomb", "anchor": "corner"},
	{"asset_name": "Target Pin", "asset_type": "Prop", "emoji": "", "icon": "Target", "anchor": "corner"},
	{"asset_name": "Love Heart", "asset_type": "Prop", "emoji": "", "icon": "Heart", "anchor": "corner"},
	# more scenes
	{"asset_name": "Night", "asset_type": "Scene", "gradient": "linear-gradient(180deg,#141e30,#243b55)"},
	{"asset_name": "Ocean", "asset_type": "Scene", "gradient": "linear-gradient(180deg,#2193b0,#6dd5ed)"},
	{"asset_name": "Gold", "asset_type": "Scene", "gradient": "linear-gradient(180deg,#f7971e,#ffd200)"},
	{"asset_name": "Aurora", "asset_type": "Scene", "gradient": "linear-gradient(180deg,#00c6ff,#0072ff)"},
	# richer SVG scenes (sky gradient + silhouette data-URI) — raw SVG encoded by _scene_bg
	{"asset_name": "City", "asset_type": "Scene", "gradient": _scene_bg(
		"<svg xmlns='http://www.w3.org/2000/svg' width='120' height='50' preserveAspectRatio='none'><g fill='#222'><rect x='5' y='25' width='12' height='25'/><rect x='20' y='15' width='10' height='35'/><rect x='33' y='30' width='14' height='20'/><rect x='50' y='10' width='9' height='40'/><rect x='62' y='22' width='13' height='28'/><rect x='78' y='18' width='10' height='32'/><rect x='91' y='28' width='12' height='22'/><rect x='106' y='14' width='9' height='36'/></g></svg>",
		"linear-gradient(180deg,#2c3e50,#fd746c)")},
	{"asset_name": "Mountains", "asset_type": "Scene", "gradient": _scene_bg(
		"<svg xmlns='http://www.w3.org/2000/svg' width='120' height='50' preserveAspectRatio='none'><polygon points='0,50 30,10 60,50' fill='#556677'/><polygon points='20,50 55,5 90,50' fill='#445566'/><polygon points='60,50 90,15 120,50' fill='#667788'/></svg>",
		"linear-gradient(180deg,#89d0f5,#d4edf7)")},
	{"asset_name": "Beach", "asset_type": "Scene", "gradient": _scene_bg(
		"<svg xmlns='http://www.w3.org/2000/svg' width='120' height='50' preserveAspectRatio='none'><circle cx='90' cy='12' r='9' fill='#FFD700' opacity='0.9'/><rect x='0' y='38' width='120' height='12' fill='#D4A96A'/></svg>",
		"linear-gradient(180deg,#87CEEB,#1a9fc0)")},
	{"asset_name": "Galaxy", "asset_type": "Scene", "gradient": _scene_bg(
		"<svg xmlns='http://www.w3.org/2000/svg' width='120' height='50' preserveAspectRatio='none'><circle cx='10' cy='8' r='1' fill='white'/><circle cx='25' cy='20' r='1.5' fill='white'/><circle cx='45' cy='5' r='1' fill='white'/><circle cx='60' cy='15' r='1' fill='white'/><circle cx='75' cy='25' r='1.5' fill='white'/><circle cx='88' cy='8' r='1' fill='white'/><circle cx='100' cy='18' r='1' fill='white'/><circle cx='112' cy='10' r='1.5' fill='white'/><circle cx='35' cy='35' r='1' fill='white'/><circle cx='55' cy='40' r='1' fill='white'/><circle cx='80' cy='38' r='1' fill='white'/><circle cx='15' cy='42' r='1' fill='white'/></svg>",
		"linear-gradient(180deg,#0a0015,#1a0033)")},
	{"asset_name": "Hills", "asset_type": "Scene", "gradient": _scene_bg(
		"<svg xmlns='http://www.w3.org/2000/svg' width='120' height='50' preserveAspectRatio='none'><path d='M0,50 Q15,20 30,30 Q45,40 60,25 Q75,10 90,28 Q105,45 120,35 L120,50 Z' fill='#228B22'/><path d='M0,50 Q20,30 40,40 Q60,50 80,38 Q100,25 120,42 L120,50 Z' fill='#56A156'/></svg>",
		"linear-gradient(180deg,#87CEEB,#d4f1f9)")},
	{"asset_name": "Cyberpunk", "asset_type": "Scene", "gradient": _scene_bg(
		"<svg xmlns='http://www.w3.org/2000/svg' width='120' height='50' preserveAspectRatio='none'><g fill='#111'><rect x='5' y='20' width='10' height='30'/><rect x='18' y='10' width='8' height='40'/><rect x='29' y='25' width='12' height='25'/><rect x='44' y='8' width='7' height='42'/><rect x='54' y='18' width='10' height='32'/><rect x='67' y='14' width='8' height='36'/><rect x='78' y='22' width='11' height='28'/><rect x='92' y='12' width='9' height='38'/><rect x='104' y='20' width='12' height='30'/></g><rect x='18' y='10' width='8' height='2' fill='#ff00ff'/><rect x='44' y='8' width='7' height='2' fill='#00ffff'/><rect x='92' y='12' width='9' height='2' fill='#ff00ff'/></svg>",
		"linear-gradient(180deg,#0d0015,#1a0030)")},
	# ── Dragon Ball × Naruto overlays (characters are frontend styles; see characters.ts) ──
	{"asset_name": "Dragon Ball", "asset_type": "Collectible", "price": 8000, "image": _svg_uri(
		"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>"
		"<circle cx='50' cy='50' r='42' fill='#f5a623' stroke='#d97b0a' stroke-width='3'/>"
		"<ellipse cx='36' cy='32' rx='13' ry='8' fill='#fff' opacity='0.45'/>"
		"<g fill='#e23b2e' font-size='20' text-anchor='middle' font-family='sans-serif'>"
		"<text x='38' y='47'>★</text><text x='62' y='47'>★</text><text x='38' y='69'>★</text><text x='62' y='69'>★</text></g>"
		"</svg>")},
	{"asset_name": "Sharingan", "asset_type": "Collectible", "price": 8000, "image": _svg_uri(
		"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>"
		"<circle cx='50' cy='50' r='42' fill='#c0271c' stroke='#7a140d' stroke-width='3'/>"
		"<circle cx='50' cy='50' r='12' fill='#111'/>"
		"<g fill='#111'><circle cx='50' cy='26' r='6'/><circle cx='71' cy='62' r='6'/><circle cx='29' cy='62' r='6'/></g>"
		"</svg>")},
	# Themed emoji collectibles.
	{"asset_name": "Shenron", "asset_type": "Collectible", "emoji": "\U0001F409"},
	{"asset_name": "Rasengan", "asset_type": "Collectible", "emoji": "\U0001F300"},
	{"asset_name": "Narutomaki", "asset_type": "Collectible", "emoji": "\U0001F365"},
	{"asset_name": "Nine-Tails", "asset_type": "Collectible", "emoji": "\U0001F98A"},
	{"asset_name": "Ninja", "asset_type": "Collectible", "emoji": "\U0001F977"},
	{"asset_name": "Ramen", "asset_type": "Collectible", "emoji": "\U0001F35C"},
	{"asset_name": "Senzu Bean", "asset_type": "Collectible", "emoji": "\U0001FAD8"},
	{"asset_name": "Kunai", "asset_type": "Collectible", "emoji": "\U0001F52A"},
	# Themed props (SVG art).
	{"asset_name": "Leaf Headband", "asset_type": "Prop", "anchor": "top", "image": _svg_uri(
		"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 40'>"
		"<rect x='2' y='12' width='96' height='16' rx='3' fill='#2b7fd4'/>"
		"<rect x='38' y='7' width='24' height='24' rx='3' fill='#c7ccd1' stroke='#8a9099' stroke-width='1.5'/>"
		"<path d='M50 13 q8 3 5 11 q-5 4 -8 -2' fill='none' stroke='#3a3f45' stroke-width='2'/>"
		"</svg>")},
	{"asset_name": "Saiyan Scouter", "asset_type": "Prop", "anchor": "corner", "image": _svg_uri(
		"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 60'>"
		"<rect x='8' y='23' width='22' height='12' rx='3' fill='#2f3640'/>"
		"<rect x='24' y='27' width='32' height='6' fill='#2f3640'/>"
		"<ellipse cx='60' cy='30' rx='30' ry='16' fill='#7CFC00' opacity='0.85' stroke='#2f7d0e' stroke-width='3'/>"
		"</svg>")},
	# Themed scenes.
	{"asset_name": "Super Saiyan Aura", "asset_type": "Scene", "gradient": "radial-gradient(circle at 50% 62%, #fff6b0, #ffcf1a 42%, #e08a00)"},
	{"asset_name": "Sharingan Sky", "asset_type": "Scene", "gradient": "radial-gradient(circle at 50% 45%, #ff6a5d, #c0271c 46%, #4a0d08)"},
	{"asset_name": "Namek", "asset_type": "Scene", "gradient": _scene_bg(
		"<svg xmlns='http://www.w3.org/2000/svg' width='120' height='50' preserveAspectRatio='none'><circle cx='100' cy='12' r='7' fill='#d7ffe0' opacity='0.8'/><g fill='#1f7d4c'><rect x='8' y='20' width='9' height='30' rx='4'/><rect x='24' y='14' width='8' height='36' rx='4'/><rect x='40' y='24' width='10' height='26' rx='5'/><rect x='58' y='10' width='8' height='40' rx='4'/><rect x='74' y='22' width='9' height='28' rx='4'/><rect x='92' y='16' width='8' height='34' rx='4'/><rect x='106' y='26' width='10' height='24' rx='5'/></g></svg>",
		"linear-gradient(180deg,#9ff0b8,#2fae6a)")},
	{"asset_name": "Hidden Leaf", "asset_type": "Scene", "gradient": _scene_bg(
		"<svg xmlns='http://www.w3.org/2000/svg' width='120' height='50' preserveAspectRatio='none'><rect x='0' y='24' width='120' height='26' fill='#a08a6f'/><g fill='#a08a6f'><circle cx='20' cy='24' r='8'/><circle cx='45' cy='24' r='8'/><circle cx='70' cy='24' r='8'/><circle cx='95' cy='24' r='8'/></g><g fill='#c1543f'><polygon points='6,50 16,40 26,50'/><polygon points='30,50 42,42 54,50'/><polygon points='66,50 78,41 90,50'/><polygon points='96,50 108,43 120,50'/></g></svg>",
		"linear-gradient(180deg,#bfe6ff,#eef9ff)")},
	# ── Premium cosmetics batch ──────────────────────────────────────────────
	{"asset_name": "Sakura", "asset_type": "Scene", "price": 6000, "gradient": "linear-gradient(180deg,#ffd9ec,#ffb0d6)"},
	{"asset_name": "Neon Night", "asset_type": "Scene", "price": 6000, "gradient": "linear-gradient(180deg,#0f0c29,#302b63,#24243e)"},
	{"asset_name": "Vaporwave", "asset_type": "Scene", "price": 6000, "gradient": "linear-gradient(160deg,#f797ff,#8a6cff,#3ad0ff)"},
	{"asset_name": "Lava", "asset_type": "Scene", "price": 6000, "gradient": "radial-gradient(circle at 50% 80%,#ffde59,#ff5e3a 42%,#7a0d0d)"},
	{"asset_name": "Deep Sea", "asset_type": "Scene", "price": 6000, "gradient": "radial-gradient(circle at 50% 18%,#2b8fc0,#0a3355 65%,#04121f)"},
	{"asset_name": "Golden Hour", "asset_type": "Scene", "price": 6000, "gradient": "linear-gradient(180deg,#f6d365,#fda085)"},
	{"asset_name": "Emerald", "asset_type": "Scene", "price": 6000, "gradient": "linear-gradient(180deg,#43e97b,#38f9d7)"},
	{"asset_name": "Royal Purple", "asset_type": "Scene", "price": 6000, "gradient": "linear-gradient(180deg,#7028e4,#e5b2ca)"},
	{"asset_name": "Gold Crown", "asset_type": "Prop", "anchor": "top", "price": 15000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='gc1' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff2b0'/><stop offset='0.5' stop-color='#f6c94a'/><stop offset='1' stop-color='#c9880f'/></linearGradient><linearGradient id='gc2' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffe27a'/><stop offset='1' stop-color='#d99a17'/></linearGradient><radialGradient id='gcr' cx='0.5' cy='0.35' r='0.7'><stop offset='0' stop-color='#ff9ecb'/><stop offset='1' stop-color='#c8347c'/></radialGradient><radialGradient id='gcg' cx='0.5' cy='0.35' r='0.7'><stop offset='0' stop-color='#8ff0c8'/><stop offset='1' stop-color='#1e9d6e'/></radialGradient><radialGradient id='gcb' cx='0.5' cy='0.35' r='0.7'><stop offset='0' stop-color='#a9d4ff'/><stop offset='1' stop-color='#2f6fd6'/></radialGradient></defs><path d='M20 72 L18 40 L34 55 L50 30 L66 55 L82 40 L80 72 Z' fill='url(#gc1)' stroke='#9c6a0a' stroke-width='2.5' stroke-linejoin='round'/><path d='M20 72 L80 72 L79 82 L21 82 Z' fill='url(#gc2)' stroke='#9c6a0a' stroke-width='2.5' stroke-linejoin='round'/><path d='M24 74 L76 74' stroke='#fff4c4' stroke-width='1.5' opacity='0.7'/><circle cx='18' cy='38' r='5' fill='url(#gcg)' stroke='#0f6b48' stroke-width='1.5'/><circle cx='50' cy='27' r='5.5' fill='url(#gcr)' stroke='#8f1f57' stroke-width='1.5'/><circle cx='82' cy='38' r='5' fill='url(#gcb)' stroke='#204d9c' stroke-width='1.5'/><circle cx='34' cy='53' r='3.5' fill='url(#gcb)' stroke='#204d9c' stroke-width='1'/><circle cx='66' cy='53' r='3.5' fill='url(#gcg)' stroke='#0f6b48' stroke-width='1'/><circle cx='35' cy='78' r='4' fill='url(#gcr)' stroke='#8f1f57' stroke-width='1.2'/><circle cx='50' cy='78' r='4' fill='url(#gcb)' stroke='#204d9c' stroke-width='1.2'/><circle cx='65' cy='78' r='4' fill='url(#gcg)' stroke='#0f6b48' stroke-width='1.2'/><circle cx='16.5' cy='36' r='1.4' fill='#fff'/><circle cx='48' cy='25' r='1.6' fill='#fff'/><circle cx='80' cy='36' r='1.4' fill='#fff'/><circle cx='33' cy='76.5' r='1.2' fill='#fff'/><circle cx='63' cy='76.5' r='1.2' fill='#fff'/><path d='M28 58 L30 52' stroke='#fff4c4' stroke-width='1.5' opacity='0.6'/><path d='M50 40 L50 34' stroke='#fff4c4' stroke-width='1.5' opacity='0.6'/><circle cx='27' cy='83' r='1' fill='#fff4c4'/><circle cx='73' cy='83' r='1' fill='#fff4c4'/></svg>")},
	{"asset_name": "Glowing Halo", "asset_type": "Prop", "anchor": "top", "price": 12000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><radialGradient id='hglow' cx='0.5' cy='0.5' r='0.5'><stop offset='0' stop-color='#fff9d6' stop-opacity='0.9'/><stop offset='0.5' stop-color='#ffe680' stop-opacity='0.35'/><stop offset='1' stop-color='#ffe680' stop-opacity='0'/></radialGradient><linearGradient id='hring' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff7c0'/><stop offset='0.5' stop-color='#ffd23d'/><stop offset='1' stop-color='#e59a10'/></linearGradient></defs><ellipse cx='50' cy='50' rx='44' ry='30' fill='url(#hglow)'/><ellipse cx='50' cy='52' rx='34' ry='15' fill='none' stroke='url(#hring)' stroke-width='8'/><ellipse cx='50' cy='52' rx='34' ry='15' fill='none' stroke='#fff7d0' stroke-width='2.5' opacity='0.8'/><ellipse cx='50' cy='52' rx='34' ry='15' fill='none' stroke='#b9760a' stroke-width='1' opacity='0.5'/><path d='M22 48 A34 15 0 0 1 42 40' fill='none' stroke='#ffffff' stroke-width='3' stroke-linecap='round' opacity='0.85'/><circle cx='24' cy='55' r='2' fill='#fff8d0'/><circle cx='76' cy='55' r='2' fill='#fff8d0'/><circle cx='50' cy='38' r='1.8' fill='#fff'/><circle cx='38' cy='62' r='1.4' fill='#fffbe0'/><circle cx='62' cy='62' r='1.4' fill='#fffbe0'/><path d='M50 20 L51.5 26 L50 32 L48.5 26 Z' fill='#fff3a8' opacity='0.9'/><path d='M20 28 L21 32 L20 36 L19 32 Z' fill='#fff3a8' opacity='0.8'/><path d='M80 30 L81 34 L80 38 L79 34 Z' fill='#fff3a8' opacity='0.8'/><circle cx='15' cy='40' r='1.5' fill='#fff7c0'/><circle cx='85' cy='42' r='1.5' fill='#fff7c0'/></svg>")},
	{"asset_name": "Party Hat", "asset_type": "Prop", "anchor": "top", "price": 8000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='ph1' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#7a4dff'/><stop offset='0.5' stop-color='#c04dff'/><stop offset='1' stop-color='#ff5db1'/></linearGradient><radialGradient id='phpom' cx='0.4' cy='0.35' r='0.7'><stop offset='0' stop-color='#fff0a0'/><stop offset='1' stop-color='#ffb327'/></radialGradient></defs><path d='M50 14 L74 82 L26 82 Z' fill='url(#ph1)' stroke='#5a2fb0' stroke-width='2.5' stroke-linejoin='round'/><path d='M50 14 L58 82 L52 82 Z' fill='#ffffff' opacity='0.18'/><path d='M40 34 L60 34' stroke='#ffe14d' stroke-width='3' stroke-linecap='round'/><path d='M36 50 L64 50' stroke='#3df0d0' stroke-width='3' stroke-linecap='round'/><path d='M32 66 L68 66' stroke='#ff5db1' stroke-width='3' stroke-linecap='round'/><circle cx='45' cy='27' r='2.5' fill='#3df0d0'/><circle cx='55' cy='42' r='2.5' fill='#ffe14d'/><circle cx='42' cy='58' r='2.5' fill='#fff'/><circle cx='60' cy='60' r='2.5' fill='#3df0d0'/><circle cx='48' cy='74' r='2.5' fill='#ffe14d'/><circle cx='38' cy='75' r='2' fill='#fff'/><circle cx='62' cy='76' r='2' fill='#ff5db1'/><circle cx='50' cy='10' r='7' fill='url(#phpom)' stroke='#e0961a' stroke-width='1.5'/><path d='M50 10 L44 4 M50 10 L56 4 M50 10 L42 12 M50 10 L58 12 M50 10 L48 2 M50 10 L52 2' stroke='#ffcf4d' stroke-width='2' stroke-linecap='round'/><circle cx='48' cy='8' r='1.8' fill='#fff8d8'/><path d='M46 20 Q48 18 50 20' stroke='#fff' stroke-width='1.5' fill='none' opacity='0.5'/></svg>")},
	{"asset_name": "Flower Crown", "asset_type": "Prop", "anchor": "top", "price": 8000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><radialGradient id='fcp' cx='0.5' cy='0.5' r='0.6'><stop offset='0' stop-color='#ffd6ec'/><stop offset='1' stop-color='#ff77b6'/></radialGradient><radialGradient id='fcy' cx='0.5' cy='0.5' r='0.6'><stop offset='0' stop-color='#fff3b0'/><stop offset='1' stop-color='#ffbf3d'/></radialGradient><radialGradient id='fcb' cx='0.5' cy='0.5' r='0.6'><stop offset='0' stop-color='#d3ccff'/><stop offset='1' stop-color='#8b6dff'/></radialGradient><radialGradient id='fcc' cx='0.5' cy='0.4' r='0.6'><stop offset='0' stop-color='#fff6c8'/><stop offset='1' stop-color='#f4a11f'/></radialGradient></defs><path d='M14 64 Q50 40 86 64' fill='none' stroke='#3f9d54' stroke-width='6' stroke-linecap='round'/><path d='M18 62 Q50 42 82 62' fill='none' stroke='#5cc873' stroke-width='2' stroke-linecap='round' opacity='0.7'/><path d='M30 58 Q26 50 20 50' stroke='#3f9d54' stroke-width='3' fill='none' stroke-linecap='round'/><path d='M70 58 Q74 50 80 50' stroke='#3f9d54' stroke-width='3' fill='none' stroke-linecap='round'/><path d='M50 46 L46 40' stroke='#3f9d54' stroke-width='3' stroke-linecap='round'/><g><circle cx='20' cy='60' r='5' fill='url(#fcy)'/><circle cx='16' cy='55' r='4.5' fill='url(#fcy)'/><circle cx='24' cy='55' r='4.5' fill='url(#fcy)'/><circle cx='16' cy='64' r='4.5' fill='url(#fcy)'/><circle cx='24' cy='64' r='4.5' fill='url(#fcy)'/><circle cx='20' cy='60' r='3' fill='url(#fcc)'/></g><g><circle cx='35' cy='52' r='5.5' fill='url(#fcb)'/><circle cx='30' cy='47' r='5' fill='url(#fcb)'/><circle cx='40' cy='47' r='5' fill='url(#fcb)'/><circle cx='30' cy='57' r='5' fill='url(#fcb)'/><circle cx='40' cy='57' r='5' fill='url(#fcb)'/><circle cx='35' cy='52' r='3.2' fill='url(#fcc)'/></g><g><circle cx='50' cy='47' r='6' fill='url(#fcp)'/><circle cx='44' cy='42' r='5' fill='url(#fcp)'/><circle cx='56' cy='42' r='5' fill='url(#fcp)'/><circle cx='44' cy='52' r='5' fill='url(#fcp)'/><circle cx='56' cy='52' r='5' fill='url(#fcp)'/><circle cx='50' cy='47' r='3.4' fill='url(#fcc)'/></g><g><circle cx='65' cy='52' r='5.5' fill='url(#fcy)'/><circle cx='60' cy='47' r='5' fill='url(#fcy)'/><circle cx='70' cy='47' r='5' fill='url(#fcy)'/><circle cx='60' cy='57' r='5' fill='url(#fcy)'/><circle cx='70' cy='57' r='5' fill='url(#fcy)'/><circle cx='65' cy='52' r='3.2' fill='url(#fcc)'/></g><g><circle cx='80' cy='60' r='5' fill='url(#fcp)'/><circle cx='76' cy='55' r='4.5' fill='url(#fcp)'/><circle cx='84' cy='55' r='4.5' fill='url(#fcp)'/><circle cx='76' cy='64' r='4.5' fill='url(#fcp)'/><circle cx='84' cy='64' r='4.5' fill='url(#fcp)'/><circle cx='80' cy='60' r='3' fill='url(#fcc)'/></g><circle cx='48' cy='44' r='1.4' fill='#fff' opacity='0.8'/><circle cx='33' cy='49' r='1.2' fill='#fff' opacity='0.7'/><circle cx='63' cy='49' r='1.2' fill='#fff' opacity='0.7'/></svg>")},
	{"asset_name": "Cat Ears", "asset_type": "Prop", "anchor": "top", "price": 8000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='ce1' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#5a4a5f'/><stop offset='1' stop-color='#2c2233'/></linearGradient><linearGradient id='ce2' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffb4d0'/><stop offset='1' stop-color='#ff7aa8'/></linearGradient></defs><path d='M18 78 L22 34 Q40 46 46 62 Z' fill='url(#ce1)' stroke='#1c1524' stroke-width='2.5' stroke-linejoin='round'/><path d='M82 78 L78 34 Q60 46 54 62 Z' fill='url(#ce1)' stroke='#1c1524' stroke-width='2.5' stroke-linejoin='round'/><path d='M24 68 L26 44 Q37 52 41 62 Z' fill='url(#ce2)'/><path d='M76 68 L74 44 Q63 52 59 62 Z' fill='url(#ce2)'/><path d='M22 36 Q23 50 27 60' stroke='#8f7a97' stroke-width='1.5' fill='none' opacity='0.7'/><path d='M78 36 Q77 50 73 60' stroke='#8f7a97' stroke-width='1.5' fill='none' opacity='0.7'/><path d='M46 64 Q50 70 54 64' fill='none' stroke='#1c1524' stroke-width='2.5' stroke-linecap='round'/><circle cx='24' cy='40' r='1.5' fill='#fff' opacity='0.6'/><circle cx='76' cy='40' r='1.5' fill='#fff' opacity='0.6'/><path d='M28 60 l2 2 M30 58 l2 2' stroke='#fff' stroke-width='1' opacity='0.5'/><path d='M72 60 l-2 2 M70 58 l-2 2' stroke='#fff' stroke-width='1' opacity='0.5'/><circle cx='33' cy='54' r='1' fill='#fff' opacity='0.7'/><circle cx='67' cy='54' r='1' fill='#fff' opacity='0.7'/></svg>")},
	{"asset_name": "Wizard Hat", "asset_type": "Prop", "anchor": "top", "price": 15000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='wh1' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#4a3aa8'/><stop offset='0.5' stop-color='#2e2170'/><stop offset='1' stop-color='#1a1240'/></linearGradient><linearGradient id='wh2' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#3a2d88'/><stop offset='1' stop-color='#221860'/></linearGradient><radialGradient id='whs' cx='0.5' cy='0.5' r='0.6'><stop offset='0' stop-color='#fff7c0'/><stop offset='1' stop-color='#ffcf3d'/></radialGradient></defs><path d='M50 8 Q56 40 72 78 L28 78 Q44 40 50 8 Z' fill='url(#wh1)' stroke='#140d33' stroke-width='2.5' stroke-linejoin='round'/><path d='M18 78 Q50 66 82 78 Q50 92 18 78 Z' fill='url(#wh2)' stroke='#140d33' stroke-width='2.5' stroke-linejoin='round'/><path d='M22 79 Q50 70 78 79' stroke='#6a5ac0' stroke-width='1.5' fill='none' opacity='0.6'/><path d='M50 12 Q54 40 66 74' stroke='#6a5ac0' stroke-width='1.5' fill='none' opacity='0.4'/><path d='M50 22 l1.6 4.4 l4.6 0.2 l-3.6 2.9 l1.3 4.5 l-3.9 -2.5 l-3.9 2.5 l1.3 -4.5 l-3.6 -2.9 l4.6 -0.2 Z' fill='url(#whs)' stroke='#e0a51f' stroke-width='0.6'/><path d='M42 48 l1.2 3.3 l3.5 0.1 l-2.7 2.2 l1 3.4 l-2.9 -1.9 l-3 1.9 l1 -3.4 l-2.7 -2.2 l3.5 -0.1 Z' fill='url(#whs)'/><path d='M60 56 l1 2.8 l3 0.1 l-2.3 1.8 l0.8 2.9 l-2.5 -1.6 l-2.5 1.6 l0.8 -2.9 l-2.3 -1.8 l3 -0.1 Z' fill='url(#whs)'/><circle cx='36' cy='68' r='1.5' fill='#fff8d0'/><circle cx='58' cy='40' r='1.5' fill='#fff8d0'/><circle cx='48' cy='62' r='1.2' fill='#fff8d0'/><path d='M14 74 l0.8 2 l2 0.8 l-2 0.8 l-0.8 2 l-0.8 -2 l-2 -0.8 l2 -0.8 Z' fill='#fff3a8'/><path d='M87 72 l0.7 1.8 l1.8 0.7 l-1.8 0.7 l-0.7 1.8 l-0.7 -1.8 l-1.8 -0.7 l1.8 -0.7 Z' fill='#fff3a8'/><circle cx='50' cy='6' r='2' fill='#fff7c0'/></svg>")},
	{"asset_name": "Devil Horns", "asset_type": "Prop", "anchor": "top", "price": 10000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='dh1' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ff8a8a'/><stop offset='0.5' stop-color='#e63946'/><stop offset='1' stop-color='#8f1620'/></linearGradient><radialGradient id='dhg' cx='0.5' cy='0.5' r='0.6'><stop offset='0' stop-color='#ffd0d0' stop-opacity='0.9'/><stop offset='1' stop-color='#ff5a5a' stop-opacity='0'/></radialGradient></defs><ellipse cx='24' cy='46' rx='16' ry='18' fill='url(#dhg)'/><ellipse cx='76' cy='46' rx='16' ry='18' fill='url(#dhg)'/><path d='M20 76 Q14 54 20 40 Q24 30 34 26 Q26 34 25 46 Q24 60 30 74 Z' fill='url(#dh1)' stroke='#6e0f18' stroke-width='2.5' stroke-linejoin='round'/><path d='M80 76 Q86 54 80 40 Q76 30 66 26 Q74 34 75 46 Q76 60 70 74 Z' fill='url(#dh1)' stroke='#6e0f18' stroke-width='2.5' stroke-linejoin='round'/><path d='M22 70 Q19 54 23 42 Q26 34 32 30' stroke='#ffb0b0' stroke-width='2' fill='none' opacity='0.6' stroke-linecap='round'/><path d='M78 70 Q81 54 77 42 Q74 34 68 30' stroke='#ffb0b0' stroke-width='2' fill='none' opacity='0.6' stroke-linecap='round'/><path d='M27 60 Q26 50 29 42' stroke='#8f1620' stroke-width='1.5' fill='none' opacity='0.5'/><path d='M73 60 Q74 50 71 42' stroke='#8f1620' stroke-width='1.5' fill='none' opacity='0.5'/><circle cx='31' cy='30' r='2' fill='#fff' opacity='0.7'/><circle cx='69' cy='30' r='2' fill='#fff' opacity='0.7'/><circle cx='34' cy='24' r='1.4' fill='#ffd0d0'/><circle cx='66' cy='24' r='1.4' fill='#ffd0d0'/></svg>")},
	{"asset_name": "Angel Wings", "asset_type": "Prop", "anchor": "corner", "price": 18000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='aw1' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffffff'/><stop offset='1' stop-color='#d6e4ff'/></linearGradient><linearGradient id='aw2' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f4f8ff'/><stop offset='1' stop-color='#bcd0f5'/></linearGradient><radialGradient id='awg' cx='0.5' cy='0.5' r='0.5'><stop offset='0' stop-color='#fff8d0' stop-opacity='0.8'/><stop offset='1' stop-color='#fff8d0' stop-opacity='0'/></radialGradient></defs><ellipse cx='50' cy='52' rx='40' ry='26' fill='url(#awg)'/><path d='M50 40 Q30 22 12 30 Q22 34 16 42 Q28 42 22 50 Q34 48 30 56 Q40 52 40 62 Q46 54 50 58 Z' fill='url(#aw1)' stroke='#9fb6e0' stroke-width='2' stroke-linejoin='round'/><path d='M50 40 Q70 22 88 30 Q78 34 84 42 Q72 42 78 50 Q66 48 70 56 Q60 52 60 62 Q54 54 50 58 Z' fill='url(#aw2)' stroke='#9fb6e0' stroke-width='2' stroke-linejoin='round'/><path d='M42 44 Q30 34 18 34' stroke='#b8cdf0' stroke-width='1.3' fill='none' opacity='0.7'/><path d='M40 50 Q30 44 22 46' stroke='#b8cdf0' stroke-width='1.3' fill='none' opacity='0.7'/><path d='M42 56 Q36 52 32 54' stroke='#b8cdf0' stroke-width='1.3' fill='none' opacity='0.7'/><path d='M58 44 Q70 34 82 34' stroke='#a6bce8' stroke-width='1.3' fill='none' opacity='0.7'/><path d='M60 50 Q70 44 78 46' stroke='#a6bce8' stroke-width='1.3' fill='none' opacity='0.7'/><path d='M58 56 Q64 52 68 54' stroke='#a6bce8' stroke-width='1.3' fill='none' opacity='0.7'/><circle cx='50' cy='50' r='4' fill='#fff6c0' stroke='#f0d060' stroke-width='1'/><circle cx='48.5' cy='48.5' r='1.3' fill='#fff'/><circle cx='16' cy='28' r='1.5' fill='#fff'/><circle cx='84' cy='28' r='1.5' fill='#fff'/><circle cx='30' cy='63' r='1.2' fill='#fff'/><circle cx='70' cy='63' r='1.2' fill='#fff'/></svg>")},
	{"asset_name": "Sleepy Cat", "asset_type": "Collectible", "price": 10000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><radialGradient id='sc_body' cx='40%' cy='30%' r='80%'><stop offset='0%' stop-color='#ffd8a8'/><stop offset='55%' stop-color='#f0a860'/><stop offset='100%' stop-color='#d67f3c'/></radialGradient><radialGradient id='sc_belly' cx='50%' cy='40%' r='70%'><stop offset='0%' stop-color='#fff6e9'/><stop offset='100%' stop-color='#ffe3c0'/></radialGradient><linearGradient id='sc_ground' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='#c9b6ff'/><stop offset='100%' stop-color='#9b7ff0'/></linearGradient></defs><ellipse cx='50' cy='84' rx='30' ry='7' fill='#000' opacity='0.12'/><ellipse cx='50' cy='80' rx='28' ry='6' fill='url(#sc_ground)'/><ellipse cx='50' cy='64' rx='30' ry='22' fill='url(#sc_body)' stroke='#b56a2e' stroke-width='1.5'/><path d='M28 60 q-8 6 -3 14 q6 -4 8 -9z' fill='url(#sc_body)' stroke='#b56a2e' stroke-width='1.2'/><path d='M72 60 q8 6 3 14 q-6 -4 -8 -9z' fill='url(#sc_body)' stroke='#b56a2e' stroke-width='1.2'/><ellipse cx='50' cy='70' rx='16' ry='11' fill='url(#sc_belly)'/><path d='M74 66 q14 -4 16 6 q-2 10 -14 6' fill='url(#sc_body)' stroke='#b56a2e' stroke-width='1.2'/><path d='M78 68 q8 -1 9 4' stroke='#b56a2e' stroke-width='1' fill='none' opacity='0.5'/><ellipse cx='50' cy='42' rx='22' ry='19' fill='url(#sc_body)' stroke='#b56a2e' stroke-width='1.5'/><path d='M32 32 l-5 -13 l14 6z' fill='url(#sc_body)' stroke='#b56a2e' stroke-width='1.3'/><path d='M68 32 l5 -13 l-14 6z' fill='url(#sc_body)' stroke='#b56a2e' stroke-width='1.3'/><path d='M33 30 l-2 -6 l6 3z' fill='#ff9ec4'/><path d='M67 30 l2 -6 l-6 3z' fill='#ff9ec4'/><ellipse cx='44' cy='36' rx='7' ry='5' fill='#fff' opacity='0.35'/><path d='M35 43 q4 3 9 0' stroke='#5c3a1e' stroke-width='2' fill='none' stroke-linecap='round'/><path d='M56 43 q4 3 9 0' stroke='#5c3a1e' stroke-width='2' fill='none' stroke-linecap='round'/><path d='M48 49 l2 2 l2 -2z' fill='#ff7fae'/><path d='M50 51 q-3 3 -6 2' stroke='#5c3a1e' stroke-width='1.3' fill='none' stroke-linecap='round'/><path d='M50 51 q3 3 6 2' stroke='#5c3a1e' stroke-width='1.3' fill='none' stroke-linecap='round'/><ellipse cx='38' cy='50' rx='4' ry='3' fill='#ff9ec4' opacity='0.55'/><ellipse cx='62' cy='50' rx='4' ry='3' fill='#ff9ec4' opacity='0.55'/><path d='M28 46 l-9 -2' stroke='#fff' stroke-width='1' opacity='0.6'/><path d='M28 49 l-9 1' stroke='#fff' stroke-width='1' opacity='0.6'/><path d='M72 46 l9 -2' stroke='#fff' stroke-width='1' opacity='0.6'/><path d='M72 49 l9 1' stroke='#fff' stroke-width='1' opacity='0.6'/><path d='M70 24 q4 -5 8 0 q-4 2 -8 6 q4 -1 8 0' fill='none' stroke='#fff' stroke-width='2' stroke-linecap='round' opacity='0.85'/><path d='M78 14 q3 -4 6 0 q-3 1 -6 4 q3 -1 6 0' fill='none' stroke='#fff' stroke-width='1.6' stroke-linecap='round' opacity='0.7'/></svg>")},
	{"asset_name": "Treasure Chest", "asset_type": "Collectible", "price": 12000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='tc_wood' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='#a8642f'/><stop offset='100%' stop-color='#6e3d18'/></linearGradient><linearGradient id='tc_gold' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='#fff2a8'/><stop offset='45%' stop-color='#ffce3a'/><stop offset='100%' stop-color='#c68a15'/></linearGradient><radialGradient id='tc_glow' cx='50%' cy='40%' r='70%'><stop offset='0%' stop-color='#fff6c0' stop-opacity='0.9'/><stop offset='100%' stop-color='#fff6c0' stop-opacity='0'/></radialGradient></defs><ellipse cx='50' cy='86' rx='34' ry='7' fill='#000' opacity='0.15'/><ellipse cx='50' cy='48' rx='40' ry='30' fill='url(#tc_glow)'/><path d='M20 46 h60 v28 a4 4 0 0 1 -4 4 h-52 a4 4 0 0 1 -4 -4z' fill='url(#tc_wood)' stroke='#4a2810' stroke-width='2'/><rect x='20' y='52' width='60' height='4' fill='#4a2810' opacity='0.4'/><rect x='20' y='62' width='60' height='3' fill='#4a2810' opacity='0.3'/><path d='M18 46 q-1 -22 32 -22 q33 0 32 22z' fill='url(#tc_wood)' stroke='#4a2810' stroke-width='2'/><path d='M18 46 q-1 -22 32 -22 q33 0 32 22' fill='none' stroke='#ffcf6b' stroke-width='1.5' opacity='0.5'/><rect x='16' y='44' width='68' height='6' rx='2' fill='url(#tc_gold)' stroke='#a06e0e' stroke-width='1.2'/><rect x='24' y='34' width='7' height='40' fill='url(#tc_gold)' stroke='#a06e0e' stroke-width='1'/><rect x='69' y='34' width='7' height='40' fill='url(#tc_gold)' stroke='#a06e0e' stroke-width='1'/><circle cx='27' cy='38' r='2' fill='#fff8d0'/><circle cx='72' cy='38' r='2' fill='#fff8d0'/><rect x='44' y='42' width='12' height='16' rx='2' fill='url(#tc_gold)' stroke='#a06e0e' stroke-width='1.3'/><circle cx='50' cy='48' r='3' fill='#6e3d18'/><rect x='49' y='48' width='2' height='6' fill='#6e3d18'/><circle cx='34' cy='40' r='4' fill='url(#tc_gold)' stroke='#a06e0e' stroke-width='0.8'/><circle cx='34' cy='40' r='1.4' fill='#fff8d0'/><circle cx='66' cy='40' r='4' fill='url(#tc_gold)' stroke='#a06e0e' stroke-width='0.8'/><circle cx='66' cy='40' r='1.4' fill='#fff8d0'/><ellipse cx='42' cy='42' rx='5' ry='4' fill='url(#tc_gold)'/><ellipse cx='55' cy='40' rx='4' ry='3' fill='url(#tc_gold)'/><ellipse cx='38' cy='44' rx='4' ry='3' fill='url(#tc_gold)'/><circle cx='45' cy='38' r='2.6' fill='#7fe3ff'/><circle cx='58' cy='42' r='2.2' fill='#ff8fb0'/><circle cx='36' cy='40' r='2' fill='#a0ff9e'/><circle cx='50' cy='36' r='2' fill='#c9a0ff'/><circle cx='44' cy='36' r='1' fill='#fff'/><path d='M60 30 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1 l3 -1z' fill='#fff' opacity='0.9'/><path d='M32 28 l0.8 2 l2 0.8 l-2 0.8 l-0.8 2 l-0.8 -2 l-2 -0.8 l2 -0.8z' fill='#fff' opacity='0.8'/><rect x='24' y='45' width='8' height='2' fill='#fff' opacity='0.6'/></svg>")},
	{"asset_name": "Magic Potion", "asset_type": "Collectible", "price": 10000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><radialGradient id='mp_glass' cx='40%' cy='35%' r='75%'><stop offset='0%' stop-color='#eafcff'/><stop offset='100%' stop-color='#bfe6f0'/></radialGradient><linearGradient id='mp_liquid' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='#b36bff'/><stop offset='50%' stop-color='#7b3bff'/><stop offset='100%' stop-color='#3a1e9e'/></linearGradient><radialGradient id='mp_shine' cx='50%' cy='40%' r='60%'><stop offset='0%' stop-color='#ff9ef0' stop-opacity='0.8'/><stop offset='100%' stop-color='#ff9ef0' stop-opacity='0'/></radialGradient><radialGradient id='mp_aura' cx='50%' cy='55%' r='60%'><stop offset='0%' stop-color='#c79bff' stop-opacity='0.7'/><stop offset='100%' stop-color='#c79bff' stop-opacity='0'/></radialGradient></defs><ellipse cx='50' cy='88' rx='24' ry='6' fill='#000' opacity='0.13'/><ellipse cx='50' cy='60' rx='34' ry='34' fill='url(#mp_aura)'/><path d='M42 34 h16 v10 q14 8 14 26 a22 22 0 0 1 -44 0 q0 -18 14 -26z' fill='url(#mp_glass)' stroke='#8fb8c4' stroke-width='2'/><path d='M40 56 q10 -6 20 0 q6 6 6 14 a16 16 0 0 1 -32 0 q0 -8 6 -14z' fill='url(#mp_liquid)'/><path d='M34 62 a16 16 0 0 0 32 0 q-4 4 -8 2 q-4 4 -8 0 q-4 4 -8 -2z' fill='#9d63ff' opacity='0.6'/><ellipse cx='43' cy='60' rx='5' ry='7' fill='url(#mp_shine)'/><circle cx='45' cy='72' r='2.5' fill='#e6c9ff' opacity='0.85'/><circle cx='55' cy='68' r='1.8' fill='#e6c9ff' opacity='0.8'/><circle cx='50' cy='76' r='1.4' fill='#f0e0ff' opacity='0.8'/><circle cx='58' cy='74' r='1.2' fill='#f0e0ff' opacity='0.7'/><path d='M40 40 q4 4 0 8' stroke='#fff' stroke-width='2' fill='none' opacity='0.7' stroke-linecap='round'/><rect x='40' y='28' width='20' height='8' rx='3' fill='#c88a4a' stroke='#8a5a2a' stroke-width='1.5'/><rect x='42' y='22' width='16' height='8' rx='2' fill='#a86a30' stroke='#7a4a1e' stroke-width='1.3'/><rect x='43' y='24' width='4' height='3' fill='#e0b078' opacity='0.7'/><path d='M50 22 q-6 -10 0 -16 q6 6 0 16z' fill='#ffd76b' opacity='0.9'/><path d='M50 6 l1.4 4 l4 1.4 l-4 1.4 l-1.4 4 l-1.4 -4 l-4 -1.4 l4 -1.4z' fill='#fff'/><path d='M66 44 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1 l3 -1z' fill='#ffd0f5' opacity='0.9'/><path d='M30 50 l0.8 2.4 l2.4 0.8 l-2.4 0.8 l-0.8 2.4 l-0.8 -2.4 l-2.4 -0.8 l2.4 -0.8z' fill='#d0e8ff' opacity='0.85'/><circle cx='72' cy='58' r='1.6' fill='#fff' opacity='0.8'/><circle cx='28' cy='68' r='1.4' fill='#fff' opacity='0.7'/></svg>")},
	{"asset_name": "Rainbow Gem", "asset_type": "Collectible", "price": 12000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='rg_a' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#ff6b9d'/><stop offset='100%' stop-color='#ff2d78'/></linearGradient><linearGradient id='rg_b' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#ffd166'/><stop offset='100%' stop-color='#ff9838'/></linearGradient><linearGradient id='rg_c' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#7bffb0'/><stop offset='100%' stop-color='#22c98a'/></linearGradient><linearGradient id='rg_d' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='#8fd0ff'/><stop offset='100%' stop-color='#4a8bff'/></linearGradient><linearGradient id='rg_e' x1='0' y1='1' x2='1' y2='0'><stop offset='0%' stop-color='#c79bff'/><stop offset='100%' stop-color='#8a3bff'/></linearGradient><radialGradient id='rg_glow' cx='50%' cy='50%' r='60%'><stop offset='0%' stop-color='#fff' stop-opacity='0.8'/><stop offset='100%' stop-color='#fff' stop-opacity='0'/></radialGradient></defs><ellipse cx='50' cy='88' rx='24' ry='6' fill='#000' opacity='0.13'/><ellipse cx='50' cy='52' rx='38' ry='38' fill='url(#rg_glow)'/><polygon points='50,20 74,40 50,86 26,40' fill='url(#rg_d)' stroke='#ffffff' stroke-width='1.5' stroke-opacity='0.6'/><polygon points='26,40 50,20 40,44 33,44' fill='url(#rg_a)'/><polygon points='50,20 74,40 67,44 60,44' fill='url(#rg_b)'/><polygon points='33,44 40,44 50,52 40,60' fill='url(#rg_c)'/><polygon points='60,44 67,44 60,60 50,52' fill='url(#rg_e)'/><polygon points='40,44 60,44 50,52' fill='#fff' opacity='0.55'/><polygon points='40,60 50,52 60,60 50,86' fill='url(#rg_d)'/><polygon points='40,60 50,52 50,86' fill='#5fa0ff' opacity='0.7'/><polygon points='60,60 50,52 50,86' fill='#3a6bd8' opacity='0.6'/><polygon points='33,44 40,44 40,60 26,40' fill='#ff8fb8' opacity='0.85'/><polygon points='67,44 60,44 60,60 74,40' fill='#a86bff' opacity='0.85'/><line x1='50' y1='52' x2='50' y2='86' stroke='#fff' stroke-width='0.8' opacity='0.5'/><polygon points='38,30 44,34 41,40 36,36' fill='#fff' opacity='0.6'/><circle cx='42' cy='33' r='1.6' fill='#fff'/><path d='M78 26 l1.4 4 l4 1.4 l-4 1.4 l-1.4 4 l-1.4 -4 l-4 -1.4 l4 -1.4z' fill='#fff' opacity='0.9'/><path d='M20 34 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1 l3 -1z' fill='#fff' opacity='0.8'/><path d='M70 62 l0.8 2.4 l2.4 0.8 l-2.4 0.8 l-0.8 2.4 l-0.8 -2.4 l-2.4 -0.8 l2.4 -0.8z' fill='#fff' opacity='0.85'/><circle cx='30' cy='58' r='1.4' fill='#fff' opacity='0.7'/></svg>")},
	{"asset_name": "Shooting Star", "asset_type": "Collectible", "price": 10000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='ss_star' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='#fff7c0'/><stop offset='45%' stop-color='#ffdb4d'/><stop offset='100%' stop-color='#ff9a2e'/></linearGradient><linearGradient id='ss_trail' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#8fd0ff' stop-opacity='0'/><stop offset='60%' stop-color='#7bb8ff' stop-opacity='0.55'/><stop offset='100%' stop-color='#ffd66b' stop-opacity='0.9'/></linearGradient><radialGradient id='ss_glow' cx='50%' cy='50%' r='55%'><stop offset='0%' stop-color='#fff3b0' stop-opacity='0.95'/><stop offset='100%' stop-color='#fff3b0' stop-opacity='0'/></radialGradient></defs><ellipse cx='58' cy='88' rx='22' ry='5' fill='#000' opacity='0.12'/><path d='M16 78 q26 -14 40 -34 q-4 24 -22 40 q-12 8 -18 -6z' fill='url(#ss_trail)'/><path d='M22 74 q20 -12 32 -28 q-4 18 -18 32z' fill='#bfe6ff' opacity='0.4'/><circle cx='30' cy='72' r='2' fill='#cfeaff' opacity='0.8'/><circle cx='40' cy='64' r='1.6' fill='#e6f4ff' opacity='0.8'/><circle cx='24' cy='76' r='1.4' fill='#ffe9a8' opacity='0.8'/><ellipse cx='62' cy='40' rx='30' ry='30' fill='url(#ss_glow)'/><polygon points='62,16 69,34 88,34 73,46 79,64 62,53 45,64 51,46 36,34 55,34' fill='url(#ss_star)' stroke='#e07a1e' stroke-width='2' stroke-linejoin='round'/><polygon points='62,16 69,34 62,40 55,34' fill='#fff' opacity='0.5'/><polygon points='62,22 66,34 62,38 58,34' fill='#fff' opacity='0.65'/><circle cx='56' cy='38' r='2' fill='#fff' opacity='0.85'/><path d='M50 40 q4 5 0 10' stroke='#e07a1e' stroke-width='1.4' fill='none' opacity='0.4' stroke-linecap='round'/><path d='M84 20 l1.4 4 l4 1.4 l-4 1.4 l-1.4 4 l-1.4 -4 l-4 -1.4 l4 -1.4z' fill='#fff' opacity='0.9'/><path d='M40 24 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1 l3 -1z' fill='#fff' opacity='0.8'/><path d='M86 54 l0.8 2.4 l2.4 0.8 l-2.4 0.8 l-0.8 2.4 l-0.8 -2.4 l-2.4 -0.8 l2.4 -0.8z' fill='#fff' opacity='0.85'/><circle cx='44' cy='18' r='1.4' fill='#fff' opacity='0.7'/><circle cx='80' cy='66' r='1.4' fill='#fff' opacity='0.7'/></svg>")},
	{"asset_name": "Baby Dragon", "asset_type": "Collectible", "price": 20000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><radialGradient id='bd_body' cx='40%' cy='30%' r='80%'><stop offset='0%' stop-color='#a8f5c0'/><stop offset='55%' stop-color='#4fd486'/><stop offset='100%' stop-color='#2a9a5e'/></radialGradient><linearGradient id='bd_belly' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='#fff6d0'/><stop offset='100%' stop-color='#ffe08a'/></linearGradient><linearGradient id='bd_wing' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#ffb3d9'/><stop offset='100%' stop-color='#ff6bb0'/></linearGradient></defs><ellipse cx='50' cy='86' rx='26' ry='6' fill='#000' opacity='0.13'/><path d='M70 68 q22 -6 20 -22 q-8 4 -12 12 q-2 -10 -10 -12z' fill='url(#bd_body)' stroke='#1f7a48' stroke-width='1.4'/><path d='M78 50 q6 -3 9 -8' stroke='#1f7a48' stroke-width='1' fill='none' opacity='0.5'/><path d='M24 46 q-16 -6 -18 4 q10 2 12 8 q2 -8 6 -12z' fill='url(#bd_wing)' stroke='#d43f88' stroke-width='1.3'/><path d='M14 46 q-4 3 -6 6' stroke='#d43f88' stroke-width='0.9' fill='none' opacity='0.5'/><ellipse cx='50' cy='60' rx='24' ry='20' fill='url(#bd_body)' stroke='#1f7a48' stroke-width='1.6'/><path d='M60 44 q22 -8 30 6 q-10 -2 -18 4 q4 -10 -12 -10z' fill='url(#bd_wing)' stroke='#d43f88' stroke-width='1.4'/><path d='M72 42 q6 0 10 4' stroke='#d43f88' stroke-width='0.9' fill='none' opacity='0.5'/><path d='M80 48 q4 2 7 6' stroke='#d43f88' stroke-width='0.9' fill='none' opacity='0.5'/><ellipse cx='48' cy='64' rx='14' ry='11' fill='url(#bd_belly)'/><path d='M40 58 h16 M40 64 h16 M42 70 h12' stroke='#e8b84a' stroke-width='1' opacity='0.5'/><ellipse cx='34' cy='78' rx='7' ry='5' fill='url(#bd_body)' stroke='#1f7a48' stroke-width='1.2'/><ellipse cx='62' cy='79' rx='7' ry='5' fill='url(#bd_body)' stroke='#1f7a48' stroke-width='1.2'/><ellipse cx='50' cy='38' rx='19' ry='17' fill='url(#bd_body)' stroke='#1f7a48' stroke-width='1.6'/><path d='M38 24 l-3 -9 l7 5z' fill='#ffe08a' stroke='#e0a838' stroke-width='1'/><path d='M62 24 l3 -9 l-7 5z' fill='#ffe08a' stroke='#e0a838' stroke-width='1'/><path d='M30 34 q-8 2 -9 8 q6 -2 10 -2z' fill='url(#bd_body)' stroke='#1f7a48' stroke-width='1.2'/><path d='M70 34 q8 2 9 8 q-6 -2 -10 -2z' fill='url(#bd_body)' stroke='#1f7a48' stroke-width='1.2'/><ellipse cx='44' cy='34' rx='8' ry='6' fill='#fff' opacity='0.3'/><circle cx='43' cy='38' r='4.5' fill='#fff'/><circle cx='44' cy='39' r='2.6' fill='#2a2a3a'/><circle cx='45' cy='38' r='0.9' fill='#fff'/><circle cx='58' cy='38' r='4.5' fill='#fff'/><circle cx='59' cy='39' r='2.6' fill='#2a2a3a'/><circle cx='60' cy='38' r='0.9' fill='#fff'/><ellipse cx='50' cy='46' rx='7' ry='5' fill='#8fe8ac'/><circle cx='47' cy='46' r='1' fill='#2a7a52'/><circle cx='53' cy='46' r='1' fill='#2a7a52'/><path d='M46 49 q4 3 8 0' stroke='#1f7a48' stroke-width='1.3' fill='none' stroke-linecap='round'/><ellipse cx='37' cy='44' rx='3.5' ry='2.5' fill='#ff9ec4' opacity='0.6'/><ellipse cx='63' cy='44' rx='3.5' ry='2.5' fill='#ff9ec4' opacity='0.6'/><path d='M46 21 q4 -4 8 0 q-2 3 -4 3 q-2 0 -4 -3z' fill='#ffd76b'/><circle cx='80' cy='24' r='1.6' fill='#fff' opacity='0.8'/><path d='M22 62 l0.8 2.4 l2.4 0.8 l-2.4 0.8 l-0.8 2.4 l-0.8 -2.4 l-2.4 -0.8 l2.4 -0.8z' fill='#fff' opacity='0.7'/></svg>")},
	{"asset_name": "Crystal Ball", "asset_type": "Collectible", "price": 18000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><radialGradient id='cb_orb' cx='38%' cy='32%' r='75%'><stop offset='0%' stop-color='#f0e6ff'/><stop offset='40%' stop-color='#b89bff'/><stop offset='75%' stop-color='#7b52e0'/><stop offset='100%' stop-color='#4a2a9e'/></radialGradient><radialGradient id='cb_inner' cx='50%' cy='55%' r='55%'><stop offset='0%' stop-color='#ffd0f5' stop-opacity='0.9'/><stop offset='100%' stop-color='#ffd0f5' stop-opacity='0'/></radialGradient><linearGradient id='cb_base' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='#ffe08a'/><stop offset='50%' stop-color='#e0a838'/><stop offset='100%' stop-color='#a06e1e'/></linearGradient><radialGradient id='cb_glow' cx='50%' cy='45%' r='60%'><stop offset='0%' stop-color='#d9c0ff' stop-opacity='0.7'/><stop offset='100%' stop-color='#d9c0ff' stop-opacity='0'/></radialGradient></defs><ellipse cx='50' cy='90' rx='28' ry='6' fill='#000' opacity='0.15'/><ellipse cx='50' cy='46' rx='42' ry='42' fill='url(#cb_glow)'/><path d='M34 74 q16 6 32 0 l4 8 q-20 8 -40 0z' fill='url(#cb_base)' stroke='#8a5a14' stroke-width='1.4'/><ellipse cx='50' cy='82' rx='22' ry='5' fill='url(#cb_base)' stroke='#8a5a14' stroke-width='1.2'/><path d='M32 76 q18 5 36 0' stroke='#fff2c0' stroke-width='1' fill='none' opacity='0.5'/><circle cx='50' cy='46' r='30' fill='url(#cb_orb)' stroke='#3a1e7a' stroke-width='1.5'/><ellipse cx='50' cy='52' rx='20' ry='16' fill='url(#cb_inner)'/><path d='M50 32 l2.6 7 l7.4 0.4 l-6 4.6 l2.2 7.2 l-6.2 -4.2 l-6.2 4.2 l2.2 -7.2 l-6 -4.6 l7.4 -0.4z' fill='#fff' opacity='0.55'/><ellipse cx='40' cy='36' rx='9' ry='6' fill='#fff' opacity='0.5' transform='rotate(-30 40 36)'/><circle cx='38' cy='34' r='3' fill='#fff' opacity='0.85'/><circle cx='60' cy='58' r='2' fill='#ffd0f5' opacity='0.8'/><circle cx='42' cy='60' r='1.6' fill='#e6d0ff' opacity='0.8'/><path d='M28 50 q4 8 12 12' stroke='#fff' stroke-width='1' fill='none' opacity='0.35'/><path d='M20 40 l1.4 4 l4 1.4 l-4 1.4 l-1.4 4 l-1.4 -4 l-4 -1.4 l4 -1.4z' fill='#fff' opacity='0.9'/><path d='M78 30 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1 l3 -1z' fill='#fff' opacity='0.85'/><path d='M76 58 l0.8 2.4 l2.4 0.8 l-2.4 0.8 l-0.8 2.4 l-0.8 -2.4 l-2.4 -0.8 l2.4 -0.8z' fill='#ffe9a8' opacity='0.85'/><circle cx='24' cy='62' r='1.4' fill='#fff' opacity='0.7'/><circle cx='68' cy='22' r='1.6' fill='#fff' opacity='0.75'/></svg>")},
	{"asset_name": "Golden Trophy", "asset_type": "Collectible", "price": 15000, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='gt_cup' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='#fff6b0'/><stop offset='40%' stop-color='#ffcf3a'/><stop offset='100%' stop-color='#c68a12'/></linearGradient><linearGradient id='gt_handle' x1='0' y1='0' x2='1' y2='0'><stop offset='0%' stop-color='#ffe066'/><stop offset='100%' stop-color='#c68a12'/></linearGradient><linearGradient id='gt_base' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='#7a4a1e'/><stop offset='100%' stop-color='#4a2a10'/></linearGradient><radialGradient id='gt_glow' cx='50%' cy='40%' r='60%'><stop offset='0%' stop-color='#fff3b0' stop-opacity='0.85'/><stop offset='100%' stop-color='#fff3b0' stop-opacity='0'/></radialGradient></defs><ellipse cx='50' cy='90' rx='30' ry='6' fill='#000' opacity='0.15'/><ellipse cx='50' cy='42' rx='42' ry='40' fill='url(#gt_glow)'/><path d='M22 30 q-14 0 -14 12 q0 12 16 12 l0 -6 q-10 0 -10 -6 q0 -6 8 -6z' fill='url(#gt_handle)' stroke='#a06e0e' stroke-width='1.5'/><path d='M78 30 q14 0 14 12 q0 12 -16 12 l0 -6 q10 0 10 -6 q0 -6 -8 -6z' fill='url(#gt_handle)' stroke='#a06e0e' stroke-width='1.5'/><path d='M26 24 h48 v10 q0 26 -24 30 q-24 -4 -24 -30z' fill='url(#gt_cup)' stroke='#a06e0e' stroke-width='2'/><rect x='24' y='20' width='52' height='7' rx='3' fill='url(#gt_cup)' stroke='#a06e0e' stroke-width='1.5'/><path d='M34 30 q-2 20 16 28' stroke='#fff' stroke-width='2.5' fill='none' opacity='0.5' stroke-linecap='round'/><path d='M40 28 q-1 14 8 22' stroke='#fff' stroke-width='1.4' fill='none' opacity='0.4' stroke-linecap='round'/><path d='M42 40 l2.6 6 l6.6 0.4 l-5.2 4.2 l1.8 6.4 l-5.6 -3.6 l-5.6 3.6 l1.8 -6.4 l-5.2 -4.2 l6.6 -0.4z' fill='#fff' opacity='0.6' transform='translate(6 -2)'/><rect x='46' y='62' width='8' height='10' fill='url(#gt_cup)' stroke='#a06e0e' stroke-width='1.2'/><path d='M38 72 h24 l-2 8 h-20z' fill='url(#gt_base)' stroke='#3a2010' stroke-width='1.5'/><rect x='34' y='80' width='32' height='7' rx='2' fill='url(#gt_base)' stroke='#3a2010' stroke-width='1.5'/><rect x='40' y='81' width='20' height='2.5' rx='1' fill='#e0b078' opacity='0.6'/><path d='M60 16 l1.4 4 l4 1.4 l-4 1.4 l-1.4 4 l-1.4 -4 l-4 -1.4 l4 -1.4z' fill='#fff' opacity='0.9'/><path d='M28 14 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1 l3 -1z' fill='#fff' opacity='0.8'/><path d='M84 50 l0.8 2.4 l2.4 0.8 l-2.4 0.8 l-0.8 2.4 l-0.8 -2.4 l-2.4 -0.8 l2.4 -0.8z' fill='#fff' opacity='0.8'/><circle cx='16' cy='52' r='1.4' fill='#fff' opacity='0.7'/><circle cx='50' cy='34' r='1.6' fill='#fff' opacity='0.8'/></svg>")},
	# ── Set capstones (earned by completing a set; not for sale) ──────────────
	{"asset_name": "Royalty Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g0' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#a78bfa'/><stop offset='1' stop-color='#6d28d9'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#g0)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><path d='M32 62 L28 38 L40 50 L50 32 L60 50 L72 38 L68 62 Z' fill='#fff8d8' stroke='#f6c94a' stroke-width='1.5' stroke-linejoin='round'/><circle cx='50' cy='40' r='2.4' fill='#ff9ecb'/></svg>")},
	{"asset_name": "Arcane Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g1' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#60a5fa'/><stop offset='1' stop-color='#3730a3'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#g1)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><path d='M50 30 L56 44 L71 45 L59 55 L63 70 L50 61 L37 70 L41 55 L29 45 L44 44 Z' fill='#fff8d8' stroke='#f6c94a' stroke-width='1.5' stroke-linejoin='round'/></svg>")},
	{"asset_name": "Party Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g2' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fb7185'/><stop offset='1' stop-color='#be185d'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#g2)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><g><rect x='36' y='40' width='7' height='7' rx='1.5' fill='#ffe14d' transform='rotate(20 39 43)'/><rect x='56' y='38' width='7' height='7' rx='1.5' fill='#3df0d0' transform='rotate(-15 59 41)'/><circle cx='50' cy='55' r='4' fill='#ff5db1'/><circle cx='40' cy='60' r='3' fill='#fff'/><circle cx='62' cy='58' r='3' fill='#7a9cff'/><path d='M50 30 L52 38 L48 38 Z' fill='#fff8d8'/></g></svg>")},
	{"asset_name": "Celestial Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g3' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#7dd3fc'/><stop offset='1' stop-color='#0369a1'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#g3)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><ellipse cx='50' cy='50' rx='20' ry='9' fill='none' stroke='#fff8d8' stroke-width='5'/><ellipse cx='50' cy='50' rx='20' ry='9' fill='none' stroke='#f6c94a' stroke-width='1.5'/></svg>")},
	{"asset_name": "Cutie Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g4' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fbcfe8'/><stop offset='1' stop-color='#db2777'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#g4)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><path d='M50 68 Q30 54 30 42 Q30 32 40 32 Q47 32 50 40 Q53 32 60 32 Q70 32 70 42 Q70 54 50 68 Z' fill='#ffe1ec' stroke='#fff' stroke-width='1.4'/></svg>")},
	{"asset_name": "Bloom Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g5' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#86efac'/><stop offset='1' stop-color='#15803d'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#g5)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><g fill='#ffe1ec'><circle cx='50' cy='38' r='7'/><circle cx='61' cy='47' r='7'/><circle cx='57' cy='60' r='7'/><circle cx='43' cy='60' r='7'/><circle cx='39' cy='47' r='7'/></g><circle cx='50' cy='50' r='6' fill='#fff2a8'/></svg>")},
	{"asset_name": "Mischief Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g6' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fca5a5'/><stop offset='1' stop-color='#b91c1c'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#g6)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><path d='M50 28 Q64 42 60 58 Q58 70 50 72 Q42 70 40 58 Q38 48 46 44 Q44 52 50 54 Q56 50 50 28 Z' fill='#ffd27a' stroke='#fff3d0' stroke-width='1.2'/></svg>")},
	# ── More set capstones ───────────────────────────────────────────────────
	{"asset_name": "Speed Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='h0' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fbbf24'/><stop offset='1' stop-color='#ea580c'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#h0)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><path d='M54 28 L40 54 L50 54 L44 72 L64 44 L53 44 Z' fill='#fff8d8' stroke='#f6c94a' stroke-width='1.5' stroke-linejoin='round'/></svg>")},
	{"asset_name": "Armory Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='h1' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#94a3b8'/><stop offset='1' stop-color='#334155'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#h1)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><path d='M50 26 L54 31 L52 60 L50 64 L48 60 L46 31 Z' fill='#eaf0f8' stroke='#fff' stroke-width='1'/><rect x='41' y='57' width='18' height='4' rx='1.5' fill='#f6c94a'/><rect x='48' y='60' width='4' height='9' rx='1' fill='#c98a2a'/></svg>")},
	{"asset_name": "Safari Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='h2' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fcd34d'/><stop offset='1' stop-color='#b45309'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#h2)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><g fill='#fff8d8'><ellipse cx='50' cy='57' rx='9' ry='7'/><circle cx='39' cy='47' r='3.6'/><circle cx='47' cy='42' r='3.6'/><circle cx='53' cy='42' r='3.6'/><circle cx='61' cy='47' r='3.6'/></g></svg>")},
	{"asset_name": "Feast Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='h3' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fdba74'/><stop offset='1' stop-color='#c2410c'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#h3)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><path d='M50 30 L56 44 L71 45 L59 55 L63 70 L50 61 L37 70 L41 55 L29 45 L44 44 Z' fill='#fff8d8' stroke='#f6c94a' stroke-width='1.5' stroke-linejoin='round'/></svg>")},
	{"asset_name": "Fortune Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='h4' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fde68a'/><stop offset='1' stop-color='#d97706'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#h4)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><path d='M50 29 L63 40 L50 69 L37 40 Z' fill='#bfe6ff' stroke='#fff' stroke-width='1.3'/><path d='M37 40 L63 40 M50 29 L44 40 L50 69 M50 29 L56 40' stroke='#7fbfff' stroke-width='1' fill='none'/></svg>")},
	{"asset_name": "Voyage Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='h5' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#67e8f9'/><stop offset='1' stop-color='#0e7490'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#h5)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><g stroke='#fff8d8' stroke-width='3.4' fill='none' stroke-linecap='round'><circle cx='50' cy='33' r='4'/><path d='M50 37 L50 67'/><path d='M39 56 Q50 71 61 56'/><path d='M42 44 L58 44'/></g></svg>")},
	{"asset_name": "Arcade Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='h6' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#c4b5fd'/><stop offset='1' stop-color='#6d28d9'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#h6)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><g><rect x='36' y='40' width='7' height='7' rx='1.5' fill='#ffe14d' transform='rotate(20 39 43)'/><rect x='56' y='38' width='7' height='7' rx='1.5' fill='#3df0d0' transform='rotate(-15 59 41)'/><circle cx='50' cy='55' r='4' fill='#ff5db1'/><circle cx='40' cy='60' r='3' fill='#fff'/><circle cx='62' cy='58' r='3' fill='#7a9cff'/><path d='M50 30 L52 38 L48 38 Z' fill='#fff8d8'/></g></svg>")},
	# ── Set capstones (batch 3) ──────────────────────────────────────────────
	{"asset_name": "Pets Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='k0' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fda4af'/><stop offset='1' stop-color='#be185d'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#k0)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><g fill='#fff8d8'><ellipse cx='50' cy='57' rx='9' ry='7'/><circle cx='39' cy='47' r='3.6'/><circle cx='47' cy='42' r='3.6'/><circle cx='53' cy='42' r='3.6'/><circle cx='61' cy='47' r='3.6'/></g></svg>")},
	{"asset_name": "Wilderness Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='k1' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#86efac'/><stop offset='1' stop-color='#166534'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#k1)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><path d='M50 28 Q68 40 58 64 Q50 72 42 64 Q32 40 50 28 Z' fill='#e6ffe9' stroke='#fff' stroke-width='1.2'/><path d='M50 33 L50 66 M50 45 L58 40 M50 54 L42 49' stroke='#7fca8a' stroke-width='1.5' fill='none'/></svg>")},
	{"asset_name": "Vista Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='k2' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#7dd3fc'/><stop offset='1' stop-color='#0c4a6e'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#k2)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><path d='M26 68 L44 38 L54 53 L62 41 L74 68 Z' fill='#fff8f0' stroke='#f6c94a' stroke-width='1.4' stroke-linejoin='round'/><path d='M44 38 L50 47 L38 47 Z' fill='#cfe6ff'/><path d='M62 41 L67 49 L57 49 Z' fill='#cfe6ff'/></svg>")},
	{"asset_name": "Regalia Crest", "asset_type": "Collectible", "earn_only": 1, "price": 0, "image": _svg_uri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='k3' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#d8b4fe'/><stop offset='1' stop-color='#7c3aed'/></linearGradient></defs><path d='M50 8 L86 22 L86 52 Q86 83 50 95 Q14 83 14 52 L14 22 Z' fill='url(#k3)' stroke='#f6c94a' stroke-width='3.5' stroke-linejoin='round'/><path d='M50 13 L81 25 L81 51 Q81 78 50 89 Q19 78 19 51 L19 25 Z' fill='none' stroke='#ffffff' stroke-width='1.4' opacity='0.35'/><path d='M32 62 L28 38 L40 50 L50 32 L60 50 L72 38 L68 62 Z' fill='#fff8d8' stroke='#f6c94a' stroke-width='1.5' stroke-linejoin='round'/><circle cx='50' cy='40' r='2.4' fill='#ff9ecb'/><circle cx='36' cy='47' r='1.8' fill='#8ecbff'/><circle cx='64' cy='47' r='1.8' fill='#8ecbff'/></svg>")},
]


# Themed collection sets (cross-type). asset_name -> set label. Drives the
# marketplace collection counter (owned N / M). Informational only.
AVATAR_SETS = {
	"Royalty": ["Gold Crown", "Crystal Ball", "Royal Purple"],
	"Arcane": ["Wizard Hat", "Magic Potion", "Baby Dragon", "Vaporwave"],
	"Cutie": ["Cat Ears", "Sleepy Cat", "Sakura"],
	"Party": ["Party Hat", "Treasure Chest", "Golden Trophy", "Golden Hour"],
	"Celestial": ["Glowing Halo", "Angel Wings", "Shooting Star", "Deep Sea"],
	"Bloom": ["Flower Crown", "Rainbow Gem", "Emerald"],
	"Mischief": ["Devil Horns", "Lava", "Neon Night"],
	"Speed": ["Red Car", "Race Car", "Motorcycle", "SUV"],
	"Armory": ["Sword", "Shield", "Bow", "Axe", "Trident"],
	"Safari": ["Wolf", "Lion", "Tiger", "Eagle"],
	"Feast": ["Pizza", "Cake", "Coffee", "Ice Cream", "Cookie"],
	"Fortune": ["Money Bag", "Diamond", "Banknote", "Piggy Bank", "Gold Medal"],
	"Voyage": ["Ship", "Sailboat", "Rocket", "UFO"],
	"Arcade": ["Gamepad", "Joystick", "Dice", "Puzzle Piece", "Robot"],
	"Pets": ["Rabbit", "Turtle", "Squirrel", "Snail", "Bug"],
	"Wilderness": ["Deciduous Tree", "Mountain", "Snowy Mountain", "Sunrise", "Waves"],
	"Vista": ["Forest", "Ocean", "Mountains", "Beach", "Hills"],
	"Regalia": ["Crown", "Cap", "Graduation Cap", "Halo"],
}
SET_MAP = {name: s for s, names in AVATAR_SETS.items() for name in names}
# Completing a set grants a capstone crest + a flat point rebate (order-independent).
SET_REWARD = {
	"Royalty": ("Royalty Crest", 5000), "Arcane": ("Arcane Crest", 6000),
	"Party": ("Party Crest", 6000), "Celestial": ("Celestial Crest", 6000),
	"Cutie": ("Cutie Crest", 5000), "Bloom": ("Bloom Crest", 5000),
	"Mischief": ("Mischief Crest", 5000),
	"Speed": ("Speed Crest", 6000),
	"Armory": ("Armory Crest", 7000),
	"Safari": ("Safari Crest", 6000),
	"Feast": ("Feast Crest", 7000),
	"Fortune": ("Fortune Crest", 7000),
	"Voyage": ("Voyage Crest", 6000),
	"Arcade": ("Arcade Crest", 7000),
	"Pets": ("Pets Crest", 7000),
	"Wilderness": ("Wilderness Crest", 7000),
	"Vista": ("Vista Crest", 7000),
	"Regalia": ("Regalia Crest", 6000),
}


def _maybe_complete_set(user, asset_name):
	"""If owning `asset_name` just completed its set (and not already claimed),
	grant the capstone + rebate once. Order-independent, idempotent."""
	s = SET_MAP.get(asset_name)
	if not s:
		return None
	owned = _asset_owned(user)
	if not all(m in owned for m in AVATAR_SETS[s]):
		return None
	if _has_claim(user, "set", s) or not _record_claim(user, "set", s):
		return None
	cap, rebate = SET_REWARD.get(s, (None, 0))
	if cap:
		_grant_asset(user, cap)
	if rebate:
		_grant_points(user, rebate, "Set")
	return {"set": s, "capstone": cap, "rebate": rebate}


def seed_avatar_assets():
	created = 0
	for a in AVATAR_ASSETS:
		vals = {"asset_type": a["asset_type"], "emoji": a.get("emoji"), "icon": a.get("icon"), "image": a.get("image"), "gradient": a.get("gradient"),
			"anchor": a.get("anchor"), "set_name": SET_MAP.get(a["asset_name"]), "earn_only": a.get("earn_only", 0), "is_default": a.get("is_default", 0), "price": a.get("price", 5000), "active": 1}
		if frappe.db.exists("Avatar Asset", a["asset_name"]):
			frappe.db.set_value("Avatar Asset", a["asset_name"], vals)
		else:
			frappe.get_doc({"doctype": "Avatar Asset", "asset_name": a["asset_name"], **vals}).insert(ignore_permissions=True)
			created += 1
	frappe.db.commit()
	return {"created": created}


def seed_gamification_settings():
	s = frappe.get_single("Avatar Gamification Settings")
	if not s.premium_price:
		s.premium_price = 50
	if not s.points_per_level:
		s.points_per_level = 100
	if not s.daily_reward_points:
		s.daily_reward_points = 10
	if not s.streak_bonus_points:
		s.streak_bonus_points = 5
	if not s.streak_cap:
		s.streak_cap = 7
	if not s.level_rewards:
		s.set("level_rewards", [
			{"level": 2, "reward_points": 0, "reward_asset": "Crown"},
			{"level": 5, "reward_points": 50, "reward_asset": "Dragon"},
			{"level": 10, "reward_points": 100, "reward_asset": "Rocket"},
		])
	if not s.achievements:
		s.set("achievements", [
			{"code": "todos10", "title": "Getting Started", "icon": "✅", "condition": "todos_completed", "threshold": 10, "reward_points": 20, "reward_asset": "Sword"},
			{"code": "pts300", "title": "Knight", "icon": "🛡️", "condition": "badge_points", "threshold": 300, "reward_points": 0, "reward_asset": "Shield"},
			{"code": "streak3", "title": "On a Roll", "icon": "🔥", "condition": "streak_days", "threshold": 3, "reward_points": 30, "reward_asset": "Race Car"},
		])
	s.flags.ignore_permissions = True
	s.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}


# ── Gamification Engine ──────────────────────────────────────────────────────

def _todos_completed(user):
	# completed-todo credits (assignee, Todo source) = proxy for completed todos
	return int(frappe.db.sql("select count(*) from `tabPoint Ledger` where user=%s and source='Todo' and role='Assignee'", user)[0][0] or 0)


def _badge_points(user):
	# lifetime work points (excludes reward/grant sources) — mirrors badge tiers
	return float(frappe.db.sql("""select coalesce(sum(points_earned),0) from `tabPoint Ledger`
		where user=%s and source not in ('Grant','Gift','Daily','Reward','Achievement')""", user)[0][0] or 0)


def _daily_state(user, s):
	row = frappe.db.get_value("Avatar Daily", {"user": user}, ["last_claim", "streak"], as_dict=True) or {}
	today = frappe.utils.today()
	last = str(row.get("last_claim") or "")
	streak = int(row.get("streak") or 0)
	can_claim = last != str(today)
	# next claim would be: yesterday-continued streak+1 else 1
	next_streak = (streak + 1) if last == str(frappe.utils.add_days(today, -1)) else 1
	cap = int(s.streak_cap or 7)
	claimable = float(s.daily_reward_points or 10) + float(s.streak_bonus_points or 5) * (min(next_streak, cap) - 1)
	return {"streak": streak, "can_claim": can_claim, "claimable": claimable, "last_claim": last}


@frappe.whitelist()
def get_gamification():
	user = frappe.session.user
	s = _gami_settings()
	ppl = float(s.points_per_level or 100) or 100
	lifetime = _lifetime_points(user)
	level = int(lifetime // ppl) + 1
	newly = []
	# ponytail: gami lock serializes concurrent grant calls; skip grants (not the read) on contention
	lock_key = f"vernon_gami:{user}"
	got_lock = frappe.db.sql("select get_lock(%s, 10)", lock_key)[0][0]
	try:
		if got_lock:
			for lr in (s.level_rewards or []):
				if level >= int(lr.level or 0) and not _has_claim(user, "level", lr.level):
					if _record_claim(user, "level", lr.level):
						_grant_points(user, lr.reward_points, "Reward")
						_grant_asset(user, lr.reward_asset)
						if (lr.reward_points and float(lr.reward_points) > 0) or lr.reward_asset:
							newly.append({"kind": "level", "level": lr.level, "asset": lr.reward_asset, "points": lr.reward_points})
		streak = int(frappe.db.get_value("Avatar Daily", {"user": user}, "streak") or 0)
		todos = _todos_completed(user)
		badge_pts = _badge_points(user)
		progress_by = {"todos_completed": todos, "badge_points": badge_pts, "streak_days": streak}
		achievements = []
		for ac in (s.achievements or []):
			progress = progress_by.get(ac.condition, 0)
			met = progress >= float(ac.threshold or 0)
			claimed = _has_claim(user, "achievement", ac.code)
			if met and not claimed:
				if got_lock and _record_claim(user, "achievement", ac.code):
					_grant_points(user, ac.reward_points, "Achievement")
					_grant_asset(user, ac.reward_asset)
					if (ac.reward_points and float(ac.reward_points) > 0) or ac.reward_asset:
						newly.append({"kind": "achievement", "code": ac.code, "asset": ac.reward_asset, "points": ac.reward_points})
				claimed = True  # already claimed either way (won or lost the race)
			achievements.append({"code": ac.code, "title": ac.title, "icon": ac.icon, "condition": ac.condition,
				"threshold": float(ac.threshold or 0), "progress": progress, "met": met, "claimed": claimed,
				"is_tier": bool(ac.is_tier), "color": ac.color,
				"reward_points": ac.reward_points, "reward_asset": ac.reward_asset})
	finally:
		if got_lock:
			frappe.db.sql("select release_lock(%s)", lock_key)
	# recompute after grants
	lifetime = _lifetime_points(user)
	level = int(lifetime // ppl) + 1
	xp_into = lifetime - (level - 1) * ppl
	_, _, balance = _user_balance(user)
	return {"level": level, "lifetime": lifetime, "points_per_level": ppl, "xp_into": xp_into,
		"xp_to_next": ppl - xp_into, "balance": balance, "newly_granted": newly,
		"achievements": achievements, "daily": _daily_state(user, s)}


@frappe.whitelist()
def claim_daily():
	user = frappe.session.user
	s = _gami_settings()
	lock_key = f"vernon_gami:{user}"
	if not frappe.db.sql("select get_lock(%s, 10)", lock_key)[0][0]:
		frappe.throw("Busy, please retry", frappe.ValidationError)
	try:
		today = frappe.utils.today()
		name = frappe.db.exists("Avatar Daily", {"user": user})
		doc = frappe.get_doc("Avatar Daily", name) if name else frappe.new_doc("Avatar Daily")
		doc.user = user
		if str(doc.last_claim or "") == str(today):
			_, _, bal = _user_balance(user)
			return {"already": True, "streak": int(doc.streak or 0), "granted": 0, "balance": bal}
		doc.streak = (int(doc.streak or 0) + 1) if str(doc.last_claim or "") == str(frappe.utils.add_days(today, -1)) else 1
		cap = int(s.streak_cap or 7)
		granted = float(s.daily_reward_points or 10) + float(s.streak_bonus_points or 5) * (min(int(doc.streak), cap) - 1)
		doc.last_claim = today
		doc.save(ignore_permissions=True)
		_grant_points(user, granted, "Daily")
		_, _, bal = _user_balance(user)
		return {"streak": int(doc.streak), "granted": granted, "balance": bal, "last_claim": str(today)}
	finally:
		frappe.db.sql("select release_lock(%s)", lock_key)


@frappe.whitelist()
def get_gamification_settings():
	_require_marketplace_manager()  # reuse existing admin gate (System Manager / Marketplace Manager)
	s = _gami_settings()
	return {
		"premium_price": s.premium_price, "points_per_level": s.points_per_level,
		"daily_reward_points": s.daily_reward_points, "streak_bonus_points": s.streak_bonus_points,
		"streak_cap": s.streak_cap,
		"level_rewards": [{"level": r.level, "reward_points": r.reward_points, "reward_asset": r.reward_asset} for r in (s.level_rewards or [])],
		"achievements": [{"code": a.code, "title": a.title, "icon": a.icon, "condition": a.condition, "threshold": a.threshold, "reward_points": a.reward_points, "reward_asset": a.reward_asset, "is_tier": int(a.is_tier or 0), "color": a.color} for a in (s.achievements or [])],
		"assets": frappe.get_all("Avatar Asset", filters={"active": 1},
			fields=["asset_name", "asset_type", "price", "is_default"],
			order_by="asset_type asc, asset_name asc"),
	}


@frappe.whitelist()
def save_gamification_settings(premium_price=None, points_per_level=None, daily_reward_points=None, streak_bonus_points=None, streak_cap=None, level_rewards=None, achievements=None, assets=None):
	_require_marketplace_manager()
	import json as _json
	s = _gami_settings()
	if premium_price is not None: s.premium_price = max(0.0, float(premium_price))
	if points_per_level is not None: s.points_per_level = max(1.0, float(points_per_level))
	if daily_reward_points is not None: s.daily_reward_points = max(0.0, float(daily_reward_points))
	if streak_bonus_points is not None: s.streak_bonus_points = max(0.0, float(streak_bonus_points))
	if streak_cap is not None: s.streak_cap = max(1, int(streak_cap))
	def _clean_asset_ref(name):
		# ponytail: db.exists per row is fine at settings-save frequency
		name = (name or "").strip() if isinstance(name, str) else name
		return name if (name and frappe.db.exists("Avatar Asset", name)) else None
	if level_rewards is not None:
		raw_lr = _json.loads(level_rewards) if isinstance(level_rewards, str) else level_rewards
		clean_lr = []
		for row in (raw_lr or []):
			lvl = row.get("level")
			try:
				lvl = float(lvl)
			except (TypeError, ValueError):
				continue
			row["reward_asset"] = _clean_asset_ref(row.get("reward_asset"))
			clean_lr.append(row)
		s.set("level_rewards", clean_lr)
	if achievements is not None:
		raw_ac = _json.loads(achievements) if isinstance(achievements, str) else achievements
		clean_ac = []
		for row in (raw_ac or []):
			if not (row.get("code") and row.get("title") and row.get("condition")):
				continue
			row["reward_asset"] = _clean_asset_ref(row.get("reward_asset"))
			clean_ac.append(row)
		s.set("achievements", clean_ac)
	s.save(ignore_permissions=True)
	if assets is not None:
		rows = _json.loads(assets) if isinstance(assets, str) else assets
		for a in rows:
			nm = a.get("asset_name")
			if nm and frappe.db.exists("Avatar Asset", nm):
				frappe.db.set_value("Avatar Asset", nm, {
					"price": float(a.get("price") or 0),
					"is_default": 1 if a.get("is_default") else 0,
				})
	frappe.clear_cache(doctype="Avatar Gamification Settings")
	return {"ok": True}


# --------------------------------------------------------------------------------
# Employee Profile endpoints
# --------------------------------------------------------------------------------

@frappe.whitelist()
def update_my_profile(
	phone=None, birthdate=None, bio=None,
	home_address=None, emergency_contact_name=None,
	emergency_contact_phone=None, emergency_contact_relation=None,
	education=None, skills=None, trainings=None,
):
	"""Self-service: caller edits ONLY their own soft fields. Legal/contract/quota unreachable here."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)

	# Native User fields (reused, not duplicated).
	user_updates = {}
	if phone is not None:
		user_updates["phone"] = phone
	if birthdate is not None:
		user_updates["birth_date"] = birthdate or None
	if bio is not None:
		user_updates["bio"] = bio
	if user_updates:
		frappe.db.set_value("User", user, user_updates)

	doc = _ensure_employee_profile(user)
	for f in ("home_address", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation"):
		val = locals().get(f)
		if val is not None:
			doc.set(f, val)

	def _rows(raw):
		return json.loads(raw) if isinstance(raw, str) else (raw or [])

	if education is not None:
		doc.set("education", [])
		for r in _rows(education):
			doc.append("education", {k: r.get(k) for k in EMPLOYEE_SOFT_CHILDREN["education"]})
	if skills is not None:
		doc.set("skills", [])
		for r in _rows(skills):
			doc.append("skills", {k: r.get(k) for k in EMPLOYEE_SOFT_CHILDREN["skills"]})
	if trainings is not None:
		doc.set("trainings", [])
		for r in _rows(trainings):
			doc.append("trainings", {k: r.get(k) for k in EMPLOYEE_SOFT_CHILDREN["trainings"]})

	doc.save(ignore_permissions=True)
	return {"status": "ok"}


@frappe.whitelist()
def get_employee_profile(user):
	"""Admin: full profile incl. legal/contract/quota for any user."""
	_require_system_manager()
	ep = _ensure_employee_profile(user)
	uf = frappe.get_value("User", user, ["full_name", "phone", "birth_date", "bio"], as_dict=True) or {}
	data = ep.as_dict()
	data["full_name"] = uf.get("full_name")
	data["phone"] = uf.get("phone")
	data["birthdate"] = uf.get("birth_date")
	data["bio"] = uf.get("bio")
	data["leave"] = _leave_balance(user)
	return data


@frappe.whitelist()
def update_employee_profile(
	user, nik_ktp=None, npwp=None, bpjs_kesehatan=None, bpjs_ketenagakerjaan=None,
	bank_name=None, bank_account_no=None, bank_account_holder=None,
	employment_status=None, job_title=None, date_joined=None,
	contract_start=None, contract_end=None, annual_leave_quota=None, prior_leave_taken=None,
):
	"""Admin: edit legal/contract/quota fields for any user."""
	_require_system_manager()
	doc = _ensure_employee_profile(user)
	fields = (
		"nik_ktp", "npwp", "bpjs_kesehatan", "bpjs_ketenagakerjaan",
		"bank_name", "bank_account_no", "bank_account_holder",
		"employment_status", "job_title", "date_joined", "contract_start", "contract_end",
	)
	for f in fields:
		val = locals().get(f)
		if val is not None:
			doc.set(f, val)
	if annual_leave_quota is not None:
		doc.annual_leave_quota = int(annual_leave_quota or 0)
	if prior_leave_taken is not None:
		doc.prior_leave_taken = int(prior_leave_taken or 0)
	doc.save(ignore_permissions=True)
	return {"status": "ok"}
