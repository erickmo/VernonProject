# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Postpone API
# ------------
# Reschedule a whole Project or a single Project Detail by picking a NEW deadline
# date. The server computes a uniform delta (new_date - current_anchor, in days)
# and adds it to every date field of every ACTIVE todo underneath, plus the
# container's own dates. Delta may be negative (pull the schedule earlier).
#
# Active = status NOT IN the three terminal states; Done/Completed/Cancelled todos
# are skipped so their locked-field validation never triggers. Uniform delta keeps
# start_date <= deadline, so validate_start_date stays happy.

import frappe
from frappe.utils import getdate, add_days

# Terminal statuses — verbatim option strings from `tabProject Todo`.`status`.
TERMINAL_STATUSES = ["\U0001f6ab Cancelled", "\U0001f7e0 Done", "✅ Completed"]


@frappe.whitelist()
def postpone(target_type, target_name, new_date):
	"""Shift a Project or Project Detail (and its active todos) to a new deadline.

	target_type -- "Project" or "Project Detail".
	target_name -- the doc name of the container to postpone.
	new_date    -- the new deadline date for the container's anchor.

	Returns {"shifted_count", "skipped_count", "delta_days"}. A missing anchor or a
	zero delta is a no-op (all-zero return, nothing saved).
	"""
	if target_type not in ("Project", "Project Detail"):
		frappe.throw("Invalid target_type")

	# Trust boundary: caller must be able to write the container.
	frappe.has_permission(target_type, "write", target_name, throw=True)

	is_project = target_type == "Project"
	scope_field = "project" if is_project else "project_detail"
	filt = {scope_field: target_name}

	# --- Anchor date ---------------------------------------------------------
	if is_project:
		anchor = frappe.db.get_value("Project", target_name, "deadline")
	else:
		anchor = frappe.db.get_value("Project Detail", target_name, "latest_deadline")
		if not anchor:
			# Fall back to the latest deadline across the detail's active todos.
			anchor = frappe.db.get_value(
				"Project Todo",
				{**filt, "status": ["not in", TERMINAL_STATUSES]},
				"max(deadline)",
			)

	if not anchor:
		return {"shifted_count": 0, "skipped_count": 0, "delta_days": 0}

	delta = (getdate(new_date) - getdate(anchor)).days
	if delta == 0:
		return {"shifted_count": 0, "skipped_count": 0, "delta_days": 0}

	def shift(v):
		return add_days(getdate(v), delta) if v else v

	# --- Scope ---------------------------------------------------------------
	active_names = frappe.get_all(
		"Project Todo",
		filters={**filt, "status": ["not in", TERMINAL_STATUSES]},
		pluck="name",
	)
	skipped_count = frappe.db.count(
		"Project Todo", {**filt, "status": ["in", TERMINAL_STATUSES]}
	)

	# --- Shift each active todo ---------------------------------------------
	for name in active_names:
		doc = frappe.get_doc("Project Todo", name)
		doc.start_date = shift(doc.start_date)
		doc.deadline = shift(doc.deadline)
		doc.leader_deadline = shift(doc.leader_deadline)
		doc.owner_deadline = shift(doc.owner_deadline)
		doc.recurring_until = shift(doc.recurring_until)
		for row in (doc.allocations or []) + (doc.assigned_allocation or []):
			if row.allocation_date:
				row.allocation_date = shift(row.allocation_date)
		# Full save keeps rollups, points, next_occurrence and notifications consistent.
		doc.save(ignore_permissions=True)

	# --- Shift the container -------------------------------------------------
	if is_project:
		pdoc = frappe.get_doc("Project", target_name)
		pdoc.start_date = shift(pdoc.start_date)
		pdoc.deadline = getdate(new_date)
		pdoc.save(ignore_permissions=True)
	else:
		ddoc = frappe.get_doc("Project Detail", target_name)
		ddoc.latest_deadline = add_days(getdate(anchor), delta)
		ddoc.save(ignore_permissions=True)

	return {
		"shifted_count": len(active_names),
		"skipped_count": skipped_count,
		"delta_days": delta,
	}
