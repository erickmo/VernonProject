# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PersonalNote(Document):
	def before_insert(self):
		if not self.user:
			self.user = frappe.session.user

	def _shared_users(self):
		return {r.shared_user for r in (self.shares or [])}


def get_permission_query_conditions(user=None):
	"""Desktop list view: owner OR shared-with sees the note."""
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return ""
	safe = frappe.db.escape(user)
	return (
		f"(`tabPersonal Note`.`user` = {safe} OR EXISTS ("
		f" SELECT 1 FROM `tabPersonal Note Share` s"
		f" WHERE s.parent = `tabPersonal Note`.name AND s.shared_user = {safe}))"
	)


def has_permission(doc, ptype="read", user=None):
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return True
	if doc.user == user:
		return True
	# shared users: read only
	if ptype == "read":
		return any(r.shared_user == user for r in (doc.shares or []))
	return False
