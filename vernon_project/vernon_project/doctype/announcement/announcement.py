# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Announcement(Document):
	def validate(self):
		# HR Manager holds create/write, so /api/resource saves skip save_announcement;
		# the link is an <a href> in every user's ticker — clean it on every save.
		from vernon_project.api.announcement import _clean_link

		self.link = _clean_link(self.link)
