"""Cross-app calendar sync (vh2ljvaatf): a source app (today, vedu_erp) posts
its class batches/sessions/seminars here as generic events; we keep the mirror
in one place — External Calendar Event — so any vernon_project user sees them
without leaving the app. Idempotent, batched, and additive: this endpoint and
its doctype are new, nothing existing changes shape.

Permission gate is a role allowlist checked here, NOT a DocType permission
row — a dedicated "Integration Client" role doesn't exist on this site yet
(that is owner/permission-grant territory), so the doctype's own permissions
stay System Manager / Project Owner / Project Leader / Project Team-read only.
Add the role name below once it exists; nothing else needs to change.
"""

import json

import frappe
from frappe import _

ALLOWED_ROLES = {"System Manager"}

REQUIRED_KEYS = ("external_key", "source_doctype", "source_name", "title", "starts_on")

UPSERT_FIELDS = (
	"source_doctype", "source_name", "title", "category", "starts_on", "ends_on",
	"all_day", "location", "url", "department", "cancelled",
)


def _check_permission():
	if not ALLOWED_ROLES & set(frappe.get_roles()):
		frappe.throw(_("Not permitted to sync calendar events."), frappe.PermissionError)


def _upsert(source_site, event):
	key = event.get("external_key")
	missing = [k for k in REQUIRED_KEYS if not event.get(k)]
	if missing:
		return {"external_key": key, "ok": False, "error": f"missing required field(s): {', '.join(missing)}"}

	fields = {"source_site": source_site}
	for f in UPSERT_FIELDS:
		fields[f] = event.get(f) or (0 if f in ("all_day", "cancelled") else None)

	try:
		if frappe.db.exists("External Calendar Event", key):
			doc = frappe.get_doc("External Calendar Event", key)
			doc.update(fields)
			doc.save(ignore_permissions=True)
		else:
			doc = frappe.get_doc({"doctype": "External Calendar Event", "external_key": key, **fields})
			doc.insert(ignore_permissions=True)
		return {"external_key": key, "ok": True}
	except Exception as e:
		return {"external_key": key, "ok": False, "error": str(e)[:200]}


@frappe.whitelist()
def sync_events(source_site, events):
	"""Batched idempotent upsert keyed on external_key. A malformed row in the
	batch is reported in its own result, never aborts the rest of the batch —
	one bad session in a 30-session cohort save must not block the other 29."""
	_check_permission()
	if not source_site:
		frappe.throw(_("source_site is required."))
	if isinstance(events, str):
		events = json.loads(events)

	results = [_upsert(source_site, e) for e in events]
	frappe.db.commit()
	return {
		"synced": sum(1 for r in results if r["ok"]),
		"failed": sum(1 for r in results if not r["ok"]),
		"results": results,
	}


CALENDAR_FIELDS = (
	"name", "source_doctype", "source_name", "title", "category",
	"starts_on", "ends_on", "all_day", "location", "url", "department",
)


def visible_events():
	"""One query: every non-cancelled synced event, respecting the caller's
	own doctype permissions (External Calendar Event is Project Team-read),
	for get_calendar's merge — this is the whole read-side cost."""
	return frappe.get_all(
		"External Calendar Event", filters={"cancelled": 0}, fields=list(CALENDAR_FIELDS), order_by="starts_on asc",
	)
