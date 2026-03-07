# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ProjectTodo(Document):

	def on_change(self):
		# On status changed
		prev_state = self.get_doc_before_save().status if self.get_doc_before_save() else None
		if prev_state != self.status:
			parent = frappe.get_doc("Project Detail", self.parent)
			parent.save()


	def on_trash(self):
		# Prevent deletion of Project Todo if it is linked to a Project Detail
		if frappe.db.exists("Project Detail", {"todo": self.name}):
			frappe.throw("Cannot delete Project Todo as it is linked to a Project Detail.")

		# Cannot Delete if status is not 'Scheduled'
		if self.status != "⚪️ Planned":
			frappe.throw("Cannot delete Project Todo unless its status is 'Scheduled'.")


# --------------------------------------------------------------------------------
# PERMISSIONS
# Catatan: Project Todo adalah child table (istable: 1).
# permission_query_conditions tidak berlaku untuk child doctypes.
# has_permission digunakan untuk validasi akses API per-dokumen.
# --------------------------------------------------------------------------------

def has_permission(doc, ptype, user):
	if "System Manager" in frappe.get_roles(user):
		return True

	# Project Todo adalah child table, ambil project via parent (Project Detail)
	if not doc.parent:
		return False

	parent_detail = frappe.get_doc("Project Detail", doc.parent)

	if not parent_detail.project:
		return False

	project = frappe.get_doc("Project", parent_detail.project)

	if user == project.project_owner:
		return True

	if user == project.project_leader:
		return True

	if any(t.user == user for t in project.team_members):
		return True

	return False

