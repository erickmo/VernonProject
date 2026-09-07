# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

REQUIRED_FIELDS = ("external_key", "source_site", "source_doctype", "source_name", "title", "starts_on")


class ExternalCalendarEvent(Document):
	def validate(self):
		for field in REQUIRED_FIELDS:
			if not self.get(field):
				frappe.throw(_("{0} is required on a synced calendar event.").format(field))
