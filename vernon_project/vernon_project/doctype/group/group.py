# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Group(Document):
	def validate(self):
		for row in self.levels:
			if not row.level_id:
				row.level_id = frappe.generate_hash(length=10)
