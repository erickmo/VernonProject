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
		if self.parent_event:
			if self.parent_event == self.name:
				frappe.throw("An event cannot be its own parent.", frappe.ValidationError)
			# one level deep only: the chosen parent must itself be a top-level event
			if frappe.db.get_value("Vernon Event", self.parent_event, "parent_event"):
				frappe.throw("Sub-events can only nest one level deep.", frappe.ValidationError)
