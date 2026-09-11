# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

REQUIRED_FIELDS = ("external_key", "source_site", "source_doctype", "source_name", "title", "starts_on")


class ExternalCalendarEvent(Document):
	def validate(self):
		self._only_the_sync_writes()
		for field in REQUIRED_FIELDS:
			if not self.get(field):
				frappe.throw(_("{0} is required on a synced calendar event.").format(field))

	def on_trash(self):
		self._only_the_sync_writes()

	def _only_the_sync_writes(self):
		"""These rows mirror another app. Only api/external_calendar.sync_events writes
		them (System Manager; it saves with ignore_permissions), but the role grid also
		gives every Project Owner and Leader write/create/delete, which no flow uses, so
		a generic save could plant a company-wide event with a link, or rewrite or
		cancel a mirrored class session."""
		if not (self.flags.ignore_permissions or "System Manager" in frappe.get_roles()):
			frappe.throw(_("Calendar events come from the connected app and can't be changed here."), frappe.PermissionError)
