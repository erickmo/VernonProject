# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_time


class ShiftTemplate(Document):
	def validate(self):
		if get_time(self.end_time) <= get_time(self.start_time):
			frappe.throw(_("End Time must be after Start Time. Overnight shifts are not supported."))
