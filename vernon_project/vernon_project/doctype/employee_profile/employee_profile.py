# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class EmployeeProfile(Document):
	pass


def get_permission_query_conditions(user=None):
	"""Desk/list scoping: System Manager sees all, everyone else only their own row."""
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return ""
	return f"`tabEmployee Profile`.`user` = {frappe.db.escape(user)}"


def has_permission(doc, ptype="read", user=None):
	"""Own-row + System Manager only. NO share-widening (unlike Personal Note)."""
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return True
	return doc.user == user


def _ensure_employee_profile(user):
	"""Get-or-create the 1:1 Employee Profile for `user`. Idempotent + race-safe."""
	name = frappe.db.exists("Employee Profile", {"user": user})
	if name:
		return frappe.get_doc("Employee Profile", name)
	try:
		doc = frappe.new_doc("Employee Profile")
		doc.user = user
		doc.insert(ignore_permissions=True)
		return doc
	except frappe.DuplicateEntryError:
		# lost a first-touch race; the other insert won — re-fetch
		return frappe.get_doc("Employee Profile", {"user": user})
