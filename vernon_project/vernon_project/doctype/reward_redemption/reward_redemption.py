# vernon_project/vernon_project/doctype/reward_redemption/reward_redemption.py
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class RewardRedemption(Document):
	def before_save(self):
		# Stamp the fulfilment time when an admin flips status to Fulfilled.
		if self.status == "Fulfilled" and not self.fulfilled_on:
			self.fulfilled_on = now_datetime()

	def on_update(self):
		old = self.get_doc_before_save()
		prev_status = old.status if old else None
		if self.status == "Fulfilled" and prev_status != "Fulfilled":
			try:
				from vernon_project.api.mobile import _notify

				_notify(
					recipient=self.user,
					type="Redemption",
					title="Reward fulfilled",
					body=f"Your redemption of “{self.reward_name}” was fulfilled.",
					reference_doctype="Reward Redemption",
					reference_name=self.name,
					actor=frappe.session.user,
				)
			except Exception:
				frappe.log_error(title="redemption notify failed")
