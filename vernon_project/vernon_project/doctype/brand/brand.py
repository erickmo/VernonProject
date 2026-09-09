# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Brand(Document):
	def on_trash(self):
		# 2026-09-09 permission sweep: Project Owner/Group Manager hold full
		# CRUD here with no controller validation -- unlike Glossary, which
		# already guards the same shape of "in use" delete for exactly this
		# reason. Mirrors that pattern.
		for doctype, field in (("Project", "brand"), ("Attendance Profile", "brand"), ("Job Opening", "brand")):
			if frappe.db.exists(doctype, {field: self.name}):
				frappe.throw(f"Cannot delete a Brand that is in use by a {doctype}.")
