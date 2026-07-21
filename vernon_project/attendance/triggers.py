# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# ponytail: recompute runs synchronously inside the triggering save. Ranges are
# bounded to enrolled past/today dates, so this is fine for normal schedules.
# If an assignment ever spans years, switch these to frappe.enqueue.

import frappe
from frappe.utils import getdate, nowdate

from vernon_project.attendance.engine import recompute_daily, recompute_range


def _resync_cuti_for_range(employee, start, end):
	# Working-days changed for this span, so re-sync any approved default-annual cuti
	# overlapping it — its ledger debit is working-day-based and would otherwise go stale.
	from vernon_project.attendance.cuti_ledger import sync_cuti
	from vernon_project.attendance.leave_quota import default_annual_type

	lt = default_annual_type()
	if not lt:
		return
	names = frappe.get_all(
		"Attendance Exception",
		filters={
			"employee": employee, "exception_type": "Leave", "status": "Approved",
			"leave_type": lt, "from_date": ["<=", end], "to_date": [">=", start],
		},
		pluck="name",
	)
	for name in names:
		sync_cuti(name)


def shift_assignment_changed(doc, method=None):
	recompute_range(doc.employee, doc.effective_from, doc.effective_to or nowdate())
	# A shift change alters working_days; re-sync approved cuti over the old ∪ new span
	# (a shrunk span drops dates the cuti still debits). Mirrors brand_changed's union.
	old = doc.get_doc_before_save()
	lo, hi = getdate(doc.effective_from), getdate(doc.effective_to or nowdate())
	if old:
		lo = min(lo, getdate(old.effective_from))
		hi = max(hi, getdate(old.effective_to or nowdate()))
	_resync_cuti_for_range(doc.employee, lo, hi)


def exception_changed(doc, method=None):
	recompute_range(doc.employee, doc.from_date, doc.to_date)
	# Keep the materialized cuti ledger in sync: mint/update/remove this exception's
	# debit rows to match its current status & dates (approve, reject, cancel, edit).
	from vernon_project.attendance.cuti_ledger import sync_cuti

	sync_cuti(doc)


def exception_trashed(doc, method=None):
	# Exception hard-deleted: drop its ledger debit rows so no phantom debit remains.
	from vernon_project.attendance.cuti_ledger import remove_cuti

	remove_cuti(doc.name)


def _employees_for_brand(brand):
	return frappe.get_all("Attendance Profile", filters={"brand": brand, "active": 1}, pluck="user")


def _list_dates(holiday_list):
	if not holiday_list:
		return set()
	return set(frappe.get_all(
		"Attendance Holiday",
		filters={"parent": holiday_list, "parenttype": "Attendance Holiday List"},
		pluck="holiday_date",
	))


def holiday_list_changed(doc, method=None):
	# Recompute dates currently in the list AND any removed in this edit, for
	# every employee whose brand points at this list. recompute_daily skips
	# future dates internally.
	old = doc.get_doc_before_save()
	dates = {h.holiday_date for h in doc.holidays}
	if old:
		dates |= {h.holiday_date for h in old.holidays}
	brands = frappe.get_all("Brand", filters={"holiday_list": doc.name}, pluck="name")
	for brand in brands:
		for emp in _employees_for_brand(brand):
			for d in dates:
				recompute_daily(emp, d)
	# Cuti-bersama days are materialized per employee; re-mint them from this list's
	# current is_cuti_bersama rows (the child table fires no events of its own).
	from vernon_project.attendance.cuti_ledger import remint_cuti_bersama_for_list

	remint_cuti_bersama_for_list(doc.name)


def brand_changed(doc, method=None):
	# When a Brand's holiday_list is (re)assigned, recompute its employees over
	# the union of the old and new lists' holiday dates.
	old = doc.get_doc_before_save()
	old_list = old.holiday_list if old else None
	if old_list == doc.holiday_list:
		return
	dates = _list_dates(old_list) | _list_dates(doc.holiday_list)
	for emp in _employees_for_brand(doc.name):
		for d in dates:
			recompute_daily(emp, d)
