# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class CompanyFeedback(Document):
	def notify_update(self):
		# Frappe's `list_update` payload carries frappe.session.user and goes to the
		# doctype room, so an anonymous submission would announce its author live to
		# every subscribed System Manager. api/feedback.py sets this flag for that
		# case; all it costs is the Desk list not auto-refreshing for that row.
		if self.flags.suppress_realtime:
			return
		super().notify_update()
