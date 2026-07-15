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
	if r.get("meta"):
		try:
			meta = json.loads(r["meta"])
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
			"meta",
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
		doc.meta = meta if isinstance(meta, str) else json.dumps(meta)
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


@frappe.whitelist()
def stop_timer(task):
	"""End the timer. Keep the row iff it carries a note (idle), else delete it."""
	name = _find(task)
	if not name:
		return {"ok": True}
	doc = frappe.get_doc(DOCTYPE, name)
	if (doc.note or "").strip():
		doc.status = "idle"
		doc.started_at_ms = 0
		doc.elapsed_before_ms = 0
		doc.estimated_ms = 0
		doc.save(ignore_permissions=True)
	else:
		frappe.delete_doc(DOCTYPE, name, ignore_permissions=True)
	_ping()
	return {"ok": True}
