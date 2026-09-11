# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from vernon_project.attendance.qr import parse_networks


class AttendanceStation(Document):
	def before_insert(self):
		if not self.secret_key:
			self.secret_key = frappe.generate_hash(length=40)
		if not self.display_key:
			self.display_key = frappe.generate_hash(length=24)

	def validate(self):
		try:
			parse_networks(self.get("allowed_networks"))  # .get(): safe before the schema migrates
		except ValueError as e:
			frappe.throw(f"Allowed Networks: {e}")
