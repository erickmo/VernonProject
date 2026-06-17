# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Glossary(Document):
	def on_trash(self):
		if frappe.db.exists("Project Detail", {"grouping": self.name}) or frappe.db.exists(
			"Project Glossary", {"glossary": self.name}
		):
			frappe.throw("Cannot delete a group that is in use by a project detail.")


def has_permission(doc, ptype, user):
	if "System Manager" in frappe.get_roles(user):
		return True
	if not doc.project:
		return False
	owner, leader = frappe.get_value("Project", doc.project, ["project_owner", "project_leader"])
	is_lead = user in (owner, leader)
	if ptype in ("create", "write", "delete"):
		return is_lead
	# read
	if is_lead:
		return True
	project = frappe.get_doc("Project", doc.project)
	if user == project.project_admin:
		return True
	return any(t.user == user for t in project.team_members)


def get_permission_query_conditions(user):
	if not user or user == "Guest":
		return ""
	if "System Manager" in frappe.get_roles(user):
		return ""
	user_esc = frappe.db.escape(user)
	return f"""
		EXISTS (
			SELECT 1 FROM `tabProject` p
			WHERE p.name = `tabGlossary`.project
				AND (
					p.project_owner = {user_esc}
					OR p.project_leader = {user_esc}
					OR p.project_admin = {user_esc}
					OR EXISTS (
						SELECT 1 FROM `tabProject Team` pt
						WHERE pt.parent = p.name AND pt.user = {user_esc}
					)
				)
		)
	"""
