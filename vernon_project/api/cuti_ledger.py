# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Whitelisted endpoints for the Cuti Ledger feature (statement, HR adjustments, re-mint).

import frappe
from frappe import _
from frappe.utils import getdate, nowdate

from vernon_project.attendance import cuti_ledger as cl
from vernon_project.api.attendance import _is_hr


@frappe.whitelist()
def get_cuti_ledger(employee=None, year=None):
	"""Ledger statement + balance for an employee/year. Own ledger for anyone, any for HR."""
	emp = employee or frappe.session.user
	if emp != frappe.session.user and not _is_hr(frappe.session.user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	yr = int(year) if year else getdate(nowdate()).year
	return {
		"status": "ok",
		"employee": emp,
		"year": yr,
		"rows": cl.statement(emp, yr),
		"summary": cl.balance_summary(emp, yr),
	}


@frappe.whitelist()
def post_cuti_adjustment(employee, entry_type, days, year, reason):
	"""HR posts a Carry-over / Bonus / Correction adjustment row."""
	if not _is_hr(frappe.session.user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	yr = int(year)
	row = cl.post_adjustment(employee, entry_type, days, yr, reason, posted_by=frappe.session.user)
	return {"status": "ok", "name": row.name, "summary": cl.balance_summary(employee, yr)}


@frappe.whitelist()
def remint_grant(employee, year):
	"""HR re-mints the annual Grant row (idempotent) after a quota change."""
	if not _is_hr(frappe.session.user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	yr = int(year)
	cl.ensure_grant(employee, yr)
	return {"status": "ok", "summary": cl.balance_summary(employee, yr)}
