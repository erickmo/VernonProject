# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class VernonEvent(Document):
	def validate(self):
		if self.is_new() and not self.organizer:
			self.organizer = frappe.session.user
		if self.pricing == "Points" and (self.points_cost or 0) <= 0:
			frappe.throw("Points-priced events need a positive Points Cost.", frappe.ValidationError)
		if self.pricing == "Rupiah" and (self.price or 0) <= 0:
			frappe.throw("Rupiah-priced events need a positive Price.", frappe.ValidationError)
		if (self.capacity or 0) < 0:
			frappe.throw("Capacity cannot be negative.", frappe.ValidationError)
