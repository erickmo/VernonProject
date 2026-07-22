# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Focus timer sync
# ----------------
# Backend persistence for the app's focus timers so they LINK across a user's
# devices (web + mobile), plus a permanent per-task note. The client owns the
# wall-clock math (start time + elapsed); these endpoints just persist the row
# and push a realtime "focus_sync" ping so the user's other devices refetch.
#
# One `Focus Timer` row per (user, task). Active = status running|paused. Stop
# keeps the row iff its note is non-empty (that's the permanent note), else
# deletes it — so a note survives the timer and reappears when the task is
# focused again on any device.

import json

import frappe

DOCTYPE = "Focus Timer"


def _user():
	user = frappe.session.user
	if not user or user == "Guest":
		frappe.throw("Login required", frappe.PermissionError)
	return user


def _find(task):
	"""Name of the (session user, task) row, or None."""
	return frappe.db.get_value(DOCTYPE, {"user": _user(), "task": task}, "name")


def _row(task):
	"""Get-or-create the (session user, task) row as a Document."""
	name = _find(task)
	if name:
		return frappe.get_doc(DOCTYPE, name)
	doc = frappe.new_doc(DOCTYPE)
	doc.user = _user()
	doc.task = task
	return doc


def _ping():
	user = frappe.session.user
	frappe.publish_realtime("focus_sync", {"user": user}, user=user, after_commit=True)


def _shape(r):
	meta = None
	if r.get("task_meta"):
		try:
			meta = json.loads(r["task_meta"])
		except (ValueError, TypeError):
			meta = None
	return {
		"taskId": r["task"],
		"taskTitle": r.get("task_title") or "",
		"estimatedMs": r.get("estimated_ms") or 0,
		"status": r.get("status") or "idle",
		"startedAt": r.get("started_at_ms") or 0,
		"elapsedBeforeMs": r.get("elapsed_before_ms") or 0,
		"note": r.get("note") or "",
		"meta": meta,
	}


@frappe.whitelist()
def list_focus():
	"""All of the current user's focus rows (active timers + noted tasks)."""
	rows = frappe.get_all(
		DOCTYPE,
		filters={"user": _user()},
		fields=[
			"task",
			"task_title",
			"estimated_ms",
			"status",
			"started_at_ms",
			"elapsed_before_ms",
			"note",
			"task_meta",
		],
	)
	return [_shape(r) for r in rows]


@frappe.whitelist()
def save_timer(task, task_title=None, estimated_ms=0, status="running", started_at_ms=0, elapsed_before_ms=0, meta=None):
	"""Upsert the active-timer state for a task (client is the source of truth)."""
	doc = _row(task)
	doc.task_title = task_title or doc.task_title
	doc.estimated_ms = frappe.utils.flt(estimated_ms)
	doc.status = status if status in ("running", "paused", "idle") else "running"
	doc.started_at_ms = frappe.utils.flt(started_at_ms)
	doc.elapsed_before_ms = frappe.utils.flt(elapsed_before_ms)
	if meta is not None:
		# Field is `task_meta`, NOT `meta`: a field named `meta` shadows Frappe's
		# Document.meta property, so doc.save() crashes with
		# "AttributeError: 'str' object has no attribute 'get_table_fields'".
		doc.task_meta = meta if isinstance(meta, str) else json.dumps(meta)
	doc.save(ignore_permissions=True)
	_ping()
	return _shape(doc.as_dict())


@frappe.whitelist()
def set_note(task, note=""):
	"""Set the permanent per-task note; creates an idle row if none exists."""
	doc = _row(task)
	doc.note = note or ""
	if not doc.status:
		doc.status = "idle"
	doc.save(ignore_permissions=True)
	_ping()
	return _shape(doc.as_dict())


def _end_row(doc):
	"""Idle a noted row (keep the permanent note), else delete it."""
	if (doc.note or "").strip():
		doc.status = "idle"
		doc.started_at_ms = 0
		doc.elapsed_before_ms = 0
		doc.estimated_ms = 0
		doc.save(ignore_permissions=True)
	else:
		frappe.delete_doc(DOCTYPE, doc.name, ignore_permissions=True)


@frappe.whitelist()
def stop_timer(task):
	"""End the timer. Keep the row iff it carries a note (idle), else delete it."""
	name = _find(task)
	if not name:
		return {"ok": True}
	_end_row(frappe.get_doc(DOCTYPE, name))
	_ping()
	return {"ok": True}


def clear_task_timers(task):
	"""End EVERY user's active timer for a task — called when the task is completed,
	cancelled or deleted. Focus rows are per-user (the assignee who focused it), but
	the status change is made by whoever approves (often a different user), so a
	client-side stop can't reach the assignee's row; this does, server-side. Pings
	each affected user so their devices drop it. Idle note-rows are left untouched."""
	rows = frappe.get_all(
		DOCTYPE, filters={"task": task, "status": ["in", ("running", "paused")]}, pluck="name"
	)
	for name in rows:
		doc = frappe.get_doc(DOCTYPE, name)
		_end_row(doc)
		frappe.publish_realtime("focus_sync", {"user": doc.user}, user=doc.user, after_commit=True)
