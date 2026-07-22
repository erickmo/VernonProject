# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# Notes — the project_owner or project_leader of any active (Ongoing) project a
# user is a team member of (plus System Managers) may write dated-or-global
# observation notes about that user. Each note is authored by its creator and
# optionally tagged with the project it was written under. All access is through
# these whitelisted endpoints (Leader Note is System-Manager-only in the desk).
# See docs/superpowers/specs/2026-07-18-intern-leaders-notes-design.md.

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


def _can_note(user, actor):
	"""True if `actor` is the project_owner or project_leader of any active
	project that `user` is a team member of."""
	if not actor or actor == user:
		return False
	member_projects = _member_projects(user)
	if not member_projects:
		return False
	return bool(
		frappe.get_all(
			"Project",
			filters={"name": ["in", member_projects], "status": ACTIVE_STATUS},
			or_filters={"project_leader": actor, "project_owner": actor},
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


def _project_meta_map(names):
	"""Resolve project names to their display titles in one query."""
	names = {n for n in names if n}
	if not names:
		return {}
	rows = frappe.get_all(
		"Project",
		filters={"name": ["in", list(names)]},
		fields=["name", "project_name"],
	)
	return {r["name"]: r.get("project_name") or r["name"] for r in rows}


def _shape_note(note, meta_map, project_map, session, admin):
	"""Shape a Leader Note (dict from get_all or doc.as_dict()) for the client."""
	author = note.get("author")
	m = meta_map.get(author) or {}
	nd = note.get("note_date")
	note_date = nd.isoformat() if hasattr(nd, "isoformat") else (str(nd) if nd else None)
	is_mine = author == session
	creation = note.get("creation")
	project = note.get("project")
	return {
		"name": note.get("name"),
		"user": note.get("user"),
		"project": project,
		"project_title": project_map.get(project) if project else None,
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


# --- notes ---------------------------------------------------------------------


@frappe.whitelist()
def add_user_note(user, body, note_date=None, shared_with_user=0, project=None):
	"""Admin or an owner/leader of `user`. Insert a Leader Note authored by the
	session user, optionally tagged with the project it was written under. Empty
	`note_date` ⇒ global/standing note. Returns the shaped note."""
	session = frappe.session.user
	admin = _is_admin()
	if not (admin or _can_note(user, session)):
		frappe.throw("Not permitted", frappe.PermissionError)
	if not frappe.db.exists("User", user):
		frappe.throw("User not found.", frappe.DoesNotExistError)
	body = (body or "").strip()
	if not body:
		frappe.throw("Note cannot be empty.")
	if isinstance(note_date, str) and not note_date.strip():
		note_date = None
	if isinstance(project, str) and not project.strip():
		project = None
	if project and not frappe.db.exists("Project", project):
		frappe.throw("Project not found.", frappe.DoesNotExistError)
	doc = frappe.get_doc({
		"doctype": "Leader Note",
		"user": user,
		"project": project or None,
		"author": session,
		"note_date": note_date or None,
		"body": body,
		"shared_with_user": 1 if cint(shared_with_user) else 0,
	}).insert(ignore_permissions=True)
	frappe.db.commit()
	return _shape_note(
		doc.as_dict(), _user_meta_map([session]), _project_meta_map([project]), session, admin
	)


@frappe.whitelist()
def list_user_notes(user, project=None):
	"""Envelope {can_add, notes[]} newest-first. Admin/owner/leader ⇒ all notes;
	the subject ⇒ shared-only; anyone else ⇒ 403. When `project` is given, the
	list is scoped to notes tagged with that project."""
	session = frappe.session.user
	if session == "Guest":
		frappe.throw("Login required.", frappe.PermissionError)
	admin = _is_admin()
	if admin or _can_note(user, session):
		can_add = True
		filters = {"user": user}
	elif session == user:
		can_add = False
		filters = {"user": user, "shared_with_user": 1}
	else:
		frappe.throw("Not permitted", frappe.PermissionError)

	if isinstance(project, str) and not project.strip():
		project = None
	if project:
		filters["project"] = project

	rows = frappe.get_all(
		"Leader Note",
		filters=filters,
		fields=[
			"name", "user", "project", "author", "note_date",
			"body", "shared_with_user", "creation",
		],
		order_by="creation desc",
	)
	meta = _user_meta_map([r["author"] for r in rows])
	project_map = _project_meta_map([r.get("project") for r in rows])
	return {
		"can_add": can_add,
		"notes": [_shape_note(r, meta, project_map, session, admin) for r in rows],
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
