# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PapanIklanBan(Document):
	def validate(self):
		if self.is_new() and not self.banned_by:
			self.banned_by = frappe.session.user
