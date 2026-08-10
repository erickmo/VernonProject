# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class MarketplaceReward(Document):
	def validate(self):
		if self.point_cost is None or self.point_cost < 0:
			frappe.throw("Point Cost must be zero or greater.")
		if self.stock_quantity is None or self.stock_quantity < 0:
			frappe.throw("Stock Quantity must be zero or greater.")
		# discounted_points is the promo price. 0/empty = no promo; only a value
		# strictly between 0 and point_cost is a valid promo.
		if self.discounted_points:
			if self.discounted_points < 0:
				frappe.throw("Discounted Points cannot be negative.")
			if self.discounted_points >= self.point_cost:
				frappe.throw("Discounted Points must be less than Point Cost.")
