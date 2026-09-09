# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Company(Document):
	def on_trash(self):
		# 2026-09-09 permission sweep: same "in use" FK-safety gap as Brand
		# (see brand.py), one level up the taxonomy.
		for doctype, field in (("Brand", "company"), ("Business Unit", "company")):
			if frappe.db.exists(doctype, {field: self.name}):
				frappe.throw(f"Cannot delete a Company that is in use by a {doctype}.")
