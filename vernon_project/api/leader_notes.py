# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# Leaders & Notes — a user's leaders are DERIVED: the project_leader of every
# active (Ongoing) project the user is a team member of. Those leaders (and
# System Managers) may write dated-or-global observation notes about the user.
# All access is through these whitelisted endpoints (Leader Note is
# System-Manager-only in the desk). See
# docs/superpowers/specs/2026-07-18-intern-leaders-notes-design.md.

import frappe
from frappe.utils import cint

# A project counts as "active" only in the Ongoing mode (Closed/Inbox excluded),
# matching the leave-gating convention elsewhere in the app.
ACTIVE_STATUS = "Ongoing"


# --- helpers -------------------------------------------------------------------


def _is_admin():
	return "System Manager" in frappe.get_roles()


def _member_projects(user):
	"""Projects `user` is a team member of (by name)."""
	return frappe.get_all("Project Team", filters={"user": user}, pluck="parent")


def _is_leader_of(user, actor):
	"""True if `actor` is the project_leader of any active project that `user`
	is a team member of."""
	if not actor or actor == user:
		return False
	member_projects = _member_projects(user)
	if not member_projects:
		return False
	return bool(
		frappe.get_all(
			"Project",
			filters={
				"name": ["in", member_projects],
				"project_leader": actor,
				"status": ACTIVE_STATUS,
			},
			limit=1,
		)
	)


def _user_meta_map(emails):
	"""Resolve user emails to {name: {full_name, user_image}} in one query."""
	emails = {e for e in emails if e}
	if not emails:
		return {}
	rows = frappe.get_all(
		"User",
		filters={"name": ["in", list(emails)]},
		fields=["name", "full_name", "user_image"],
	)
	return {r["name"]: r for r in rows}


def _shape_note(note, meta_map, session, admin):
	"""Shape a Leader Note (dict from get_all or doc.as_dict()) for the client."""
	author = note.get("author")
	m = meta_map.get(author) or {}
	nd = note.get("note_date")
	note_date = nd.isoformat() if hasattr(nd, "isoformat") else (str(nd) if nd else None)
	is_mine = author == session
	creation = note.get("creation")
	return {
		"name": note.get("name"),
		"user": note.get("user"),
		"author": author,
		"author_name": m.get("full_name") or author,
		"author_image": m.get("user_image"),
		"note_date": note_date,
		"body": note.get("body"),
		"shared_with_user": 1 if note.get("shared_with_user") else 0,
		"is_mine": is_mine,
		"can_delete": is_mine or admin,
		"creation": str(creation) if creation else None,
	}


def _leaders_of(user):
	"""The user's derived leaders: distinct project_leaders of the active
	projects `user` is a team member of."""
	member_projects = _member_projects(user)
	if not member_projects:
		return []
	rows = frappe.get_all(
		"Project",
		filters={"name": ["in", member_projects], "status": ACTIVE_STATUS},
		fields=["project_leader"],
	)
	leaders, seen = [], set()
	for r in rows:
		leader = r.get("project_leader")
		if leader and leader != user and leader not in seen:
			seen.add(leader)
			leaders.append(leader)
	meta = _user_meta_map(leaders)
	return [{
		"leader": leader,
		"leader_name": (meta.get(leader) or {}).get("full_name") or leader,
		"user_image": (meta.get(leader) or {}).get("user_image"),
	} for leader in leaders]


# --- leaders -------------------------------------------------------------------


@frappe.whitelist()
def get_user_leaders(user):
	"""The user's derived leaders. Visible to the user themselves, their
	leaders, or an admin. Returns [{leader, leader_name, user_image}]."""
	session = frappe.session.user
	if not (session == user or _is_admin() or _is_leader_of(user, session)):
		frappe.throw("Not permitted", frappe.PermissionError)
	return _leaders_of(user)


@frappe.whitelist()
def list_led_users():
	"""Any logged-in user. The distinct team members of the active projects the
	caller leads: [{user, user_name, user_image}]."""
	session = frappe.session.user
	if session == "Guest":
		frappe.throw("Login required.", frappe.PermissionError)
	led_projects = frappe.get_all(
		"Project",
		filters={"project_leader": session, "status": ACTIVE_STATUS},
		pluck="name",
	)
	if not led_projects:
		return []
	rows = frappe.get_all(
		"Project Team", filters={"parent": ["in", led_projects]}, fields=["user"]
	)
	users, seen = [], set()
	for r in rows:
		u = r.get("user")
		if u and u != session and u not in seen:
			seen.add(u)
			users.append(u)
	meta = _user_meta_map(users)
	return [{
		"user": u,
		"user_name": (meta.get(u) or {}).get("full_name") or u,
		"user_image": (meta.get(u) or {}).get("user_image"),
	} for u in users]


# --- notes ---------------------------------------------------------------------


@frappe.whitelist()
def add_user_note(user, body, note_date=None, shared_with_user=0):
	"""Admin or a leader of `user`. Insert a Leader Note authored by the session
	user. Empty `note_date` ⇒ global/standing note. Returns the shaped note."""
	session = frappe.session.user
	admin = _is_admin()
	if not (admin or _is_leader_of(user, session)):
		frappe.throw("Not permitted", frappe.PermissionError)
	if not frappe.db.exists("User", user):
		frappe.throw("User not found.", frappe.DoesNotExistError)
	body = (body or "").strip()
	if not body:
		frappe.throw("Note cannot be empty.")
	if isinstance(note_date, str) and not note_date.strip():
		note_date = None
	doc = frappe.get_doc({
		"doctype": "Leader Note",
		"user": user,
		"author": session,
		"note_date": note_date or None,
		"body": body,
		"shared_with_user": 1 if cint(shared_with_user) else 0,
	}).insert(ignore_permissions=True)
	frappe.db.commit()
	return _shape_note(doc.as_dict(), _user_meta_map([session]), session, admin)


@frappe.whitelist()
def list_user_notes(user):
	"""Envelope {can_add, notes[]} newest-first. Admin/leader ⇒ all notes; the
	subject ⇒ shared-only; anyone else ⇒ 403."""
	session = frappe.session.user
	if session == "Guest":
		frappe.throw("Login required.", frappe.PermissionError)
	admin = _is_admin()
	if admin or _is_leader_of(user, session):
		can_add = True
		filters = {"user": user}
	elif session == user:
		can_add = False
		filters = {"user": user, "shared_with_user": 1}
	else:
		frappe.throw("Not permitted", frappe.PermissionError)

	rows = frappe.get_all(
		"Leader Note",
		filters=filters,
		fields=["name", "user", "author", "note_date", "body", "shared_with_user", "creation"],
		order_by="creation desc",
	)
	meta = _user_meta_map([r["author"] for r in rows])
	return {
		"can_add": can_add,
		"notes": [_shape_note(r, meta, session, admin) for r in rows],
	}


@frappe.whitelist()
def delete_user_note(name):
	"""The note's author or an admin may delete it."""
	session = frappe.session.user
	author = frappe.db.get_value("Leader Note", name, "author")
	if author is None:
		frappe.throw("Note not found.", frappe.DoesNotExistError)
	if not (author == session or _is_admin()):
		frappe.throw("Not permitted", frappe.PermissionError)
	frappe.delete_doc("Leader Note", name, ignore_permissions=True)
	frappe.db.commit()
	return {"name": name}
