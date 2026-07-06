# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

AD_TYPES = ("Sell", "Buy", "Rent")


class PapanIklan(Document):
	def validate(self):
		if self.is_new() and not self.author:
			self.author = frappe.session.user
		if self.ad_type not in AD_TYPES:
			frappe.throw("Choose Sell, Buy, or Rent.", frappe.ValidationError)
		if (self.price or 0) < 0:
			frappe.throw("Price cannot be negative.", frappe.ValidationError)
		if self.ad_type != "Rent":
			self.rate_period = None
