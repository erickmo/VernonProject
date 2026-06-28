# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import hmac

import frappe
from frappe import _
from frappe.utils import cint, getdate, now_datetime, nowdate

from vernon_project.attendance import qr
from vernon_project.attendance.engine import recompute_daily


@frappe.whitelist(allow_guest=True)
def station_token(station, key):
	"""Kiosk display polls this for the live rotating QR payload. Gated by display_key."""
	if not frappe.db.get_single_value("Vernon Settings", "attendance_enabled"):
		frappe.throw(_("Attendance is disabled"), frappe.PermissionError)
	display_key = frappe.db.get_value("Attendance Station", station, "display_key")
	if not display_key or not hmac.compare_digest(str(key), str(display_key)):
		frappe.throw(_("Invalid station key"), frappe.PermissionError)
	return qr.current_payload(station)


@frappe.whitelist()
def attendance_scan(station, counter, token):
	"""Employee scans a station QR. Returns recomputed status for today."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	if not frappe.db.get_single_value("Vernon Settings", "attendance_enabled"):
		return {"status": "error", "message": _("Attendance is currently disabled.")}
	if not frappe.db.exists("Attendance Profile", {"user": user, "active": 1}):
		return {"status": "error", "message": _("You are not enrolled in attendance.")}
	if not frappe.db.get_value("Attendance Station", station, "active"):
		return {"status": "error", "message": _("Unknown or inactive station.")}
	if not qr.verify(station, counter, token):
		return {"status": "error", "message": _("QR expired — scan the live code again.")}

	frappe.get_doc({
		"doctype": "Attendance Scan",
		"employee": user,
		"station": station,
		"scan_time": now_datetime(),
		"token_counter": cint(counter),
	}).insert(ignore_permissions=True)

	daily = recompute_daily(user, nowdate())
	return {"status": "ok", "daily": _serialize(daily)}


def _serialize(daily):
	if not daily:
		return None
	return {
		"status": daily["status"],
		"late_minutes": daily["late_minutes"],
		"early_minutes": daily["early_minutes"],
		"penalty_points": daily["penalty_points"],
		"first_scan": str(daily["first_scan"]) if daily["first_scan"] else None,
		"last_scan": str(daily["last_scan"]) if daily["last_scan"] else None,
	}


@frappe.whitelist()
def my_attendance(limit=30):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	rows = frappe.get_all(
		"Daily Attendance",
		filters={"employee": user},
		fields=["attendance_date", "status", "first_scan", "last_scan",
				"late_minutes", "early_minutes", "penalty_points"],
		order_by="attendance_date desc",
		limit=min(cint(limit), 200),
	)
	return {"status": "ok", "rows": rows}


def _require_attendance_admin():
	if "System Manager" not in frappe.get_roles(frappe.session.user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


@frappe.whitelist()
def attendance_report(from_date, to_date, employee=None, brand=None, status=None):
	"""Daily Attendance rows for the admin report, with summary stats."""
	_require_attendance_admin()
	conditions = ["da.attendance_date BETWEEN %(from_date)s AND %(to_date)s"]
	params = {"from_date": from_date, "to_date": to_date}
	if employee:
		conditions.append("da.employee = %(employee)s")
		params["employee"] = employee
	if status:
		conditions.append("da.status = %(status)s")
		params["status"] = status
	if brand:
		conditions.append("ap.brand = %(brand)s")
		params["brand"] = brand
	where = " AND ".join(conditions)

	rows = frappe.db.sql(
		f"""
		SELECT da.employee, ap.brand, da.attendance_date, da.status,
			   da.first_scan, da.last_scan, da.late_minutes, da.early_minutes,
			   da.penalty_points
		FROM `tabDaily Attendance` da
		LEFT JOIN `tabAttendance Profile` ap ON ap.user = da.employee
		WHERE {where}
		ORDER BY da.attendance_date DESC, da.employee ASC
		""",
		params,
		as_dict=True,
	)

	stats = {"present": 0, "late": 0, "absent": 0, "excused": 0, "penalty": 0.0}
	for r in rows:
		stats["penalty"] += float(r.penalty_points or 0)
		if r.status in ("Present",):
			stats["present"] += 1
		elif r.status in ("Late", "EarlyLeave", "Late+EarlyLeave"):
			stats["late"] += 1
		elif r.status == "Absent":
			stats["absent"] += 1
		elif r.status in ("Excused-WFH", "Excused-Leave", "Holiday", "OffDay"):
			stats["excused"] += 1

	columns = [
		{"label": "Employee", "fieldname": "employee", "fieldtype": "Link"},
		{"label": "Brand", "fieldname": "brand", "fieldtype": "Data"},
		{"label": "Date", "fieldname": "attendance_date", "fieldtype": "Date"},
		{"label": "Status", "fieldname": "status", "fieldtype": "Data"},
		{"label": "In", "fieldname": "first_scan", "fieldtype": "Datetime"},
		{"label": "Out", "fieldname": "last_scan", "fieldtype": "Datetime"},
		{"label": "Late (min)", "fieldname": "late_minutes", "fieldtype": "Int"},
		{"label": "Early (min)", "fieldname": "early_minutes", "fieldtype": "Int"},
		{"label": "Penalty", "fieldname": "penalty_points", "fieldtype": "Float"},
	]
	return {"columns": columns, "rows": rows, "stats": stats}


@frappe.whitelist()
def request_exception(from_date, to_date, exception_type, reason=None):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	if exception_type not in ("WFH", "Leave"):
		return {"status": "error", "message": _("Invalid type.")}
	if getdate(to_date) < getdate(from_date):
		return {"status": "error", "message": _("To Date cannot be before From Date.")}
	doc = frappe.get_doc({
		"doctype": "Attendance Exception",
		"employee": user,
		"from_date": from_date,
		"to_date": to_date,
		"exception_type": exception_type,
		"reason": reason,
		"status": "Pending",
	}).insert(ignore_permissions=True)
	return {"status": "ok", "name": doc.name}
