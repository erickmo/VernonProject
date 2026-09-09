# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class VernonSettings(Document):
	def validate(self):
		# Numeric penalty/threshold fields are guarded by non_negative:1 on the
		# field itself (real server-side enforcement, not form-only) -- this
		# only covers what a field-level constraint can't: don't let production
		# payment mode go live pointing at nothing.
		if self.midtrans_is_production:
			server_key = self.get_password("midtrans_server_key", raise_exception=False)
			if not (self.midtrans_client_key and server_key):
				frappe.throw("Midtrans production mode needs both a client key and a server key set.")
