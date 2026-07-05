# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate


class ProjectDetail(Document):

	def before_validate(self):
		# Total = bonus amount - discount (Rupiah rewards); Point rewards carry no discount.
		# ponytail: legacy rows have reward_type = None -> treated as Rupiah so their totals don't shift.
		bonus = self.bonus_amount if self.bonus_amount else 0
		discount = self.discount if self.discount else 0
		self.total = bonus if self.reward_type == "Point" else bonus - discount

		# Rollups from the (now standalone) Project Todo rows.
		self._apply_rollups()

	def validate(self):
		if not self.project:
			frappe.throw("Project is required.")

		# grouping is optional; when set it must belong to the project
		if self.grouping:
			grouping_doc = frappe.get_doc("Glossary", self.grouping)
			if grouping_doc.project != self.project:
				frappe.throw("Grouping must be part of the selected Project.")

		# glossaries must be part of grouping
		if self.glossaries:
			for glossary in self.glossaries:
				glossary_doc = frappe.get_doc("Glossary", glossary.glossary)
				if glossary_doc.project != self.project:
					frappe.throw(
						f"Glossary {glossary.glossary} must be part of the selected Project."
					)

		# bonus amount >= discount (Rupiah rewards only)
		if self.reward_type != "Point" and self.bonus_amount and self.discount:
			if self.bonus_amount < self.discount:
				frappe.throw("Bonus Amount cannot be less than Total Discount.")

	def on_trash(self):
		# Cannot delete a project detail that still has tasks.
		if frappe.db.count("Project Todo", {"project_detail": self.name}) > 0:
			frappe.throw("Cannot delete a project detail that has tasks.")

	def _apply_rollups(self):
		"""Compute rollup fields onto self (in-memory) from linked Project Todos.

		Used during the Project Detail's own save. The standalone equivalent for
		out-of-band recompute (triggered by a Project Todo change) is the module
		function ``recompute_detail_rollups`` below.
		"""
		stats = _todo_stats(self.name)
		self.todo_count = stats["count"]
		self.latest_todo = stats["latest_deadline"]
		self.todo_without_estimation = stats["without_estimation"]
		self.total_estimated = stats["total_estimated"]
		self.total_remaining_estimated = stats["total_remaining"]
		self.status = _derive_status(stats, self.is_pending)


def _todo_stats(detail_name):
	"""Aggregate Project Todo rows for one Project Detail.

	Cancelled todos are excluded from all counts/estimates so they do not
	affect the derived status (e.g. cancelling the last Planned todo must
	not flip the detail to "Completed").
	"""
	rows = frappe.get_all(
		"Project Todo",
		filters={"project_detail": detail_name, "status": ["!=", "🚫 Cancelled"]},
		fields=["estimated", "status", "deadline"],
	)
	count = len(rows)
	total_estimated = 0
	without_estimation = 0
	total_remaining = 0
	deadlines = []
	for r in rows:
		est = r.estimated or 0
		total_estimated += est
		without_estimation += 0 if est > 0 else 1
		if r.status == "⚪️ Planned":
			total_remaining += est
		if r.deadline:
			deadlines.append(getdate(r.deadline))
	return {
		"count": count,
		"total_estimated": total_estimated,
		"without_estimation": without_estimation,
		"total_remaining": total_remaining,
		"latest_deadline": max(deadlines, default=None),
	}


def _derive_status(stats, is_pending):
	if stats["total_remaining"] == 0 and stats["count"] > 0:
		return "Completed"
	if is_pending == 1:
		return "Pending"
	return "Ongoing"


def recompute_detail_rollups(detail_name):
	"""Recompute and persist Project Detail rollups from its Project Todos.

	Called by Project Todo controller hooks (after_insert / on_update / on_trash)
	so the parent stays in sync without a full parent save. Writes via a single
	db.set_value with update_modified=False to avoid touching the modified stamp
	and to avoid re-entering the Project Detail save cycle.
	"""
	if not detail_name or not frappe.db.exists("Project Detail", detail_name):
		return
	stats = _todo_stats(detail_name)
	is_pending = frappe.db.get_value("Project Detail", detail_name, "is_pending")
	frappe.db.set_value(
		"Project Detail",
		detail_name,
		{
			"todo_count": stats["count"],
			"latest_todo": stats["latest_deadline"],
			"todo_without_estimation": stats["without_estimation"],
			"total_estimated": stats["total_estimated"],
			"total_remaining_estimated": stats["total_remaining"],
			"status": _derive_status(stats, is_pending),
		},
		update_modified=False,
	)


# --------------------------------------------------------------------------------
# PERMISSIONS
# --------------------------------------------------------------------------------

def get_permission_query_conditions(user):
	if not user or user == "Guest":
		return ""

	if "System Manager" in frappe.get_roles(user):
		return ""

	user_esc = frappe.db.escape(user)

	# Hanya tampilkan Project Detail yang project-nya:
	# - project_owner = user
	# - project_leader = user
	# - project_admin = user
	# - ATAU user ada di Project Team
	return f"""
		EXISTS (
			SELECT 1
			FROM `tabProject` p
			WHERE p.name = `tabProject Detail`.project
				AND (
					p.project_owner = {user_esc}
					OR p.project_leader = {user_esc}
					OR p.project_admin = {user_esc}
					OR EXISTS (
						SELECT 1
						FROM `tabProject Team` pt
						WHERE pt.parent = p.name
							AND pt.user = {user_esc}
					)
				)
		)
	"""


def has_permission(doc, ptype, user):
	if "System Manager" in frappe.get_roles(user):
		return True

	if not doc.project:
		return False

	project = frappe.get_doc("Project", doc.project)

	if user == project.project_owner:
		return True

	if user == project.project_leader:
		return True

	if user == project.project_admin:
		return True

	if any(t.user == user for t in project.team_members):
		return True

	return False
