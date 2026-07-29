# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Habit(Document):
	def before_insert(self):
		if not self.user:
			self.user = frappe.session.user


def get_permission_query_conditions(user=None):
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return ""
	return "`tabHabit`.`user` = {0}".format(frappe.db.escape(user))


def has_permission(doc, ptype="read", user=None):
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return True
	return doc.user == user
