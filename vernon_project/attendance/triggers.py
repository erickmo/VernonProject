# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# ponytail: recompute runs synchronously inside the triggering save. Ranges are
# bounded to enrolled past/today dates, so this is fine for normal schedules.
# If an assignment ever spans years, switch these to frappe.enqueue.

import frappe
from frappe.utils import nowdate

from vernon_project.attendance.engine import recompute_daily, recompute_range


def shift_assignment_changed(doc, method=None):
	recompute_range(doc.employee, doc.effective_from, doc.effective_to or nowdate())


def exception_changed(doc, method=None):
	recompute_range(doc.employee, doc.from_date, doc.to_date)


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
