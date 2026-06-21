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
