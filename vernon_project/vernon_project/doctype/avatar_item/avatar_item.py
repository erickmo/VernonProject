# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class AvatarItem(Document):
	def validate(self):
		if self.slot in ("Hat", "Face") and not self.socket:
			frappe.throw("Socket is required for Hat/Face items")
		if self.slot == "Base":
			self.socket = None
