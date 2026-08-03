# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class VernonNotification(Document):
	pass


def on_doctype_update():
	# Runs on every migrate AND fresh install, so new sites index too (patches are
	# skipped on install). The unread-badge count (recipient + is_read) runs on
	# every app boot; the notification list filters recipient + sorts by creation.
	# One composite serves both — verified with EXPLAIN (was a full 14k-row scan).
	frappe.db.add_index("Vernon Notification", ["recipient", "is_read", "creation"])
