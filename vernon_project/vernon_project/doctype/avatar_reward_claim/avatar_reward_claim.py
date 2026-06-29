# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class AvatarRewardClaim(Document):
	def autoname(self):
		self.name = f"{self.user}|{self.claim_type}|{self.claim_ref}"
