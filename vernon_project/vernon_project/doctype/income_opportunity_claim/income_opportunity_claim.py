# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from vernon_project.vernon_project.doctype.income_opportunity.income_opportunity import (
	is_effectively_closed,
)


class IncomeOpportunityClaim(Document):
	def validate(self):
		if self.is_new():
			# Trust boundary: the submitter is always the session user, and a new
			# claim always starts Submitted — ignore any client-sent values.
			if frappe.session.user == "Guest":
				frappe.throw(_("You must be logged in to submit a claim."))
			self.claimed_by = frappe.session.user
			self.status = "Submitted"
			if is_effectively_closed(self.opportunity):
				frappe.throw(_("This opportunity is closed and no longer accepts claims."))


def get_permission_query_conditions(user):
	# List/report scoping: a user sees only their own claims; System Manager
	# sees all. Guest sees none.
	if not user or user == "Guest":
		return "1=0"
	if "System Manager" in frappe.get_roles(user):
		return ""
	return "`tabIncome Opportunity Claim`.`claimed_by` = {0}".format(frappe.db.escape(user))


def has_permission(doc, ptype, user):
	# Single-doc scoping mirrors the query condition. System Manager: full.
	# Everyone else: read only their own; never write/delete.
	if "System Manager" in frappe.get_roles(user):
		return True
	if ptype in ("write", "delete"):
		return False
	if ptype == "read":
		return doc.claimed_by == user
	return None  # create governed by role-level perms
