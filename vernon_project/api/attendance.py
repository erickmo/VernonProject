# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import hmac

import frappe
from frappe import _
from frappe.utils import cint, getdate, now_datetime, nowdate

from vernon_project.attendance import qr
from vernon_project.attendance.engine import recompute_daily
from vernon_project.attendance.approval import leaders_for_projects


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


def _leaders_for_employee(employee):
	"""Distinct project_leaders of every Ongoing project the employee is a
	team member of, excluding the employee themselves. Snapshot for a request.

	Empty when the employee owns any of those projects — an owner outranks the
	leaders, so their request goes straight to HR (see leaders_for_projects)."""
	team_rows = frappe.get_all("Project Team", filters={"user": employee}, fields=["parent"])
	project_names = list({r.parent for r in team_rows})
	if not project_names:
		return []
	projects = frappe.get_all(
		"Project",
		filters={"name": ["in", project_names], "status": "Ongoing"},
		fields=["project_owner", "project_leader"],
	)
	return leaders_for_projects([(p.project_owner, p.project_leader) for p in projects], employee)


def _is_hr(user):
	roles = frappe.get_roles(user)
	return "HR Manager" in roles or "System Manager" in roles


def _enabled_holders(role):
	"""Enabled users holding `role`. Disabled accounts keep their Has Role rows,
	so the enabled filter has to run before any emptiness test — see _hr_users."""
	users = [
		r.parent for r in frappe.get_all(
			"Has Role",
			filters={"parenttype": "User", "role": role},
			fields=["parent"],
		)
	]
	if not users:
		return []
	return sorted({
		u.name for u in frappe.get_all(
			"User",
			filters={"name": ["in", users], "enabled": 1},
			fields=["name"],
		)
	})


def _hr_users():
	"""Who to notify about a new request.

	Enabled HR Manager holders, falling back to enabled System Managers when
	nobody holds the role — otherwise a site that deploys before granting it
	notifies nobody and wedges every request at Pending with no visible cause.

	The fallback keys off the ENABLED set, not the raw Has Role rows: a departed
	HR person's disabled account keeps its role row, which would otherwise look
	like "HR exists", skip the fallback, and silently notify no one.
	"""
	return _enabled_holders("HR Manager") or _enabled_holders("System Manager")


def _exc_label(doc):
	return "Cuti" if doc.exception_type == "Leave" else "WFH"


def _notify_leaders_new_request(doc, leaders):
	from vernon_project.api.mobile import _notify
	label = _exc_label(doc)
	for leader in leaders:
		_notify(
			leader,
			"Approval",
			# Advisory since 2026-07-15: HR decides. Wording says "input", not
			# "approval", so a leader does not think the cuti waits on them.
			_("{0} request needs your input").format(label),
			_("{0} requested {1}: {2} → {3}").format(doc.employee, label, doc.from_date, doc.to_date),
			# Pseudo-doctype (cf. "Wallet"): the leader's approval queue and the
			# requester's own list are different screens, and the real doctype is
			# identical for both. Tag the audience here so the apps can route it.
			"Attendance Exception Approval",
			doc.name,
			doc.employee,
		)


def _notify_hr_new_request(doc):
	from vernon_project.api.mobile import _notify
	label = _exc_label(doc)
	for hr in _hr_users():
		_notify(
			hr,
			"Approval",
			_("{0} request needs HR approval").format(label),
			_("{0} requested {1}: {2} → {3}").format(doc.employee, label, doc.from_date, doc.to_date),
			# Third audience, third pseudo-doctype -> routes to the HR inbox.
			"Attendance Exception HR",
			doc.name,
			doc.employee,
		)


def _notify_employee_decision(doc, status, reason=None, actor=None):
	from vernon_project.api.mobile import _notify
	label = _exc_label(doc)
	if status == "Approved":
		title = _("{0} approved").format(label)
		body = _("Your {0} request ({1} → {2}) was approved.").format(label, doc.from_date, doc.to_date)
	else:
		title = _("{0} rejected").format(label)
		body = _("Your {0} request ({1} → {2}) was rejected.").format(label, doc.from_date, doc.to_date)
		if reason:
			body += " — " + reason
	_notify(doc.employee, "Approval", title, body, "Attendance Exception", doc.name, actor)


@frappe.whitelist()
def my_leaders():
	"""The leaders who will review the caller's next request. Preview only —
	request_exception re-snapshots at insert time and that snapshot is the one
	that counts."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	return {"status": "ok", "leaders": _leaders_for_employee(user)}


@frappe.whitelist()
def list_leave_types():
	"""Enabled leave categories the caller may pick, filtered by their gender."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	emp_gender = frappe.db.get_value("Employee Profile", {"user": user}, "gender")
	rows = frappe.get_all(
		"Leave Type",
		filters={"enabled": 1},
		fields=["name", "leave_name", "limit_kind", "day_limit", "gender",
		        "requires_proof", "paid", "is_default_annual", "description", "sort_order"],
		order_by="sort_order asc",
	)
	# Keep Any + the caller's own gender; drop the other gender's types.
	rows = [r for r in rows if r.gender == "Any" or (emp_gender and r.gender == emp_gender)]
	return {"status": "ok", "types": rows}


_LEAVE_TYPE_FIELDS = ("leave_name", "enabled", "limit_kind", "day_limit", "gender",
                      "requires_proof", "paid", "is_default_annual", "description", "sort_order")


@frappe.whitelist()
def admin_list_leave_types():
	if not _is_hr(frappe.session.user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	rows = frappe.get_all("Leave Type", fields=["name", *_LEAVE_TYPE_FIELDS], order_by="sort_order asc")
	return {"status": "ok", "types": rows}


@frappe.whitelist()
def save_leave_type(name=None, **fields):
	if not _is_hr(frappe.session.user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if fields.get("limit_kind") and fields["limit_kind"] not in ("Annual Quota", "Per Event", "Documented"):
		frappe.throw(_("Invalid limit kind."))
	if fields.get("gender") and fields["gender"] not in ("Any", "Male", "Female"):
		frappe.throw(_("Invalid gender."))
	doc = frappe.get_doc("Leave Type", name) if name else frappe.new_doc("Leave Type")
	for f in _LEAVE_TYPE_FIELDS:
		if f in fields and fields[f] is not None:
			doc.set(f, fields[f])
	if int(doc.is_default_annual or 0) == 1 and int(doc.enabled or 0) == 0:
		return {"status": "error", "message": _("Kategori cuti tahunan default tidak dapat dinonaktifkan.")}
	doc.save(ignore_permissions=True)
	# At most one default-annual type — dedupe AFTER save so doc.name is final.
	if int(doc.is_default_annual or 0) == 1:
		frappe.db.sql("UPDATE `tabLeave Type` SET is_default_annual = 0 WHERE name != %s", (doc.name,))
	frappe.db.commit()
	return {"status": "ok", "name": doc.name}


@frappe.whitelist()
def delete_leave_type(name):
	if not _is_hr(frappe.session.user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if frappe.db.get_value("Leave Type", name, "is_default_annual"):
		return {"status": "error", "message": _("Kategori cuti tahunan default tidak dapat dihapus.")}
	if frappe.db.exists("Attendance Exception", {"leave_type": name}):
		return {"status": "error", "message": _("Kategori dipakai pengajuan yang ada; nonaktifkan saja.")}
	frappe.delete_doc("Leave Type", name, ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok"}


@frappe.whitelist()
def sync_holidays(list_name, year):
	"""Auto-pull Indonesian public holidays (incl. cuti bersama) for `year` from Google's
	public Indonesian holiday calendar (ICS) into Attendance Holiday List `list_name`.
	Cuti bersama rows are flagged by name ("Cuti Bersama ..."). Upsert by date; manual
	rows are kept. The id.indonesian feed is Bahasa-named — the en. one omits cuti bersama."""
	if not _is_hr(frappe.session.user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	import re
	import requests

	yr = int(year)
	url = ("https://calendar.google.com/calendar/ical/"
	       "id.indonesian%23holiday%40group.v.calendar.google.com/public/basic.ics")
	try:
		resp = requests.get(url, timeout=15)
		resp.raise_for_status()
	except Exception:
		frappe.throw(_("Gagal mengambil data libur. Coba lagi."))

	# Parse VEVENTs: pair each all-day DTSTART (YYYYMMDD) with its SUMMARY, keep target year.
	items = []
	for block in resp.text.split("BEGIN:VEVENT")[1:]:
		m_d = re.search(r"DTSTART[^:]*:(\d{8})", block)
		m_s = re.search(r"SUMMARY:(.+)", block)
		if not (m_d and m_s):
			continue
		d = m_d.group(1)
		if int(d[:4]) != yr:
			continue
		name = m_s.group(1).strip().rstrip("\r").replace("\\,", ",").replace("\\;", ";")
		items.append((f"{d[:4]}-{d[4:6]}-{d[6:8]}", name))

	if not items:
		frappe.throw(_("Data libur untuk tahun {0} belum tersedia.").format(yr))

	doc = frappe.get_doc("Attendance Holiday List", list_name)
	existing = {}
	for row in doc.holidays:
		if row.holiday_date:
			existing[str(getdate(row.holiday_date))] = row

	seen = set()
	n_added = n_updated = 0
	for key, name in items:
		if key in seen:
			continue  # feed can repeat a date across blocks; take the first
		seen.add(key)
		is_cb = 1 if "cuti bersama" in name.lower() else 0
		row = existing.get(key)
		if row:
			row.description = name
			row.is_cuti_bersama = is_cb
			n_updated += 1
		else:
			doc.append("holidays", {"holiday_date": key, "description": name, "is_cuti_bersama": is_cb})
			n_added += 1

	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok", "added": n_added, "updated": n_updated}


@frappe.whitelist()
def request_exception(from_date, to_date, exception_type, reason=None, leave_type=None, proof=None):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	if exception_type not in ("WFH", "Leave"):
		return {"status": "error", "message": _("Invalid type.")}
	if getdate(to_date) < getdate(from_date):
		return {"status": "error", "message": _("To Date cannot be before From Date.")}
	if exception_type == "Leave":
		if not leave_type:
			return {"status": "error", "message": _("Pilih kategori cuti.")}
		# Authoritative gate — raises frappe.ValidationError (Bahasa) on violation.
		from vernon_project.attendance.leave_quota import check_request
		check_request(user, leave_type, from_date, to_date, has_proof=bool(proof))
	else:
		leave_type = None
		proof = None
	leaders = _leaders_for_employee(user)
	approvers = [{"approver": leader, "decision": "Pending"} for leader in leaders]
	doc = frappe.get_doc({
		"doctype": "Attendance Exception",
		"employee": user,
		"from_date": from_date,
		"to_date": to_date,
		"exception_type": exception_type,
		"leave_type": leave_type,
		"proof": proof,
		"reason": reason,
		# Always Pending now: HR is the final approver, so a leaderless request
		# waits for HR like any other (the old empty-approvers auto-approve is
		# gone with derive_status).
		"status": "Pending",
		"hr_decision": "Pending",
		"approvers": approvers,
	}).insert(ignore_permissions=True)
	if leaders:
		_notify_leaders_new_request(doc, leaders)
	_notify_hr_new_request(doc)
	return {"status": "ok", "name": doc.name, "approval_status": "Pending"}


def _vote_exception(exception_id, decision, reason, as_hr=False):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	doc = frappe.get_doc("Attendance Exception", exception_id)

	if as_hr:
		if not _is_hr(user):
			return {"status": "error", "message": _("Only HR can decide this request.")}
		doc.hr_decision = decision
		doc.hr_by = user
		doc.hr_decided_at = now_datetime()
		doc.hr_reason = reason if decision == "Rejected" else None
		# status is a straight mirror of hr_decision — same Select options.
		doc.status = decision
	else:
		row = next((r for r in doc.approvers if r.approver == user), None)
		if row is None:
			return {"status": "error", "message": _("You are not an approver for this request.")}
		if doc.hr_decision != "Pending":
			return {"status": "error", "message": _("HR has already decided this request.")}
		row.decision = decision
		row.decided_at = now_datetime()
		row.reason = reason if decision == "Rejected" else None
		# Advisory only: a leader vote never moves doc.status.

	doc.approver = user
	doc.save(ignore_permissions=True)  # on_update -> exception_changed recomputes the day
	if as_hr and doc.status in ("Approved", "Rejected"):
		_notify_employee_decision(doc, doc.status, reason, actor=user)
	return {"status": "ok", "approval_status": doc.status}


@frappe.whitelist()
def approve_exception(exception_id, as_hr=0):
	return _vote_exception(exception_id, "Approved", None, as_hr=cint(as_hr) == 1)


@frappe.whitelist()
def reject_exception(exception_id, reason=None, as_hr=0):
	reason = (reason or "").strip()
	if not reason:
		return {"status": "error", "message": _("Alasan penolakan wajib diisi.")}
	return _vote_exception(exception_id, "Rejected", reason, as_hr=cint(as_hr) == 1)


def _shape_exception_rows(names):
	if not names:
		return []
	excs = frappe.get_all(
		"Attendance Exception",
		filters={"name": ["in", names]},
		fields=[
			"name", "employee", "exception_type", "from_date", "to_date",
			"status", "reason", "leave_type", "proof", "hr_decision", "hr_by", "hr_reason",
		],
		order_by="from_date desc",
	)
	appr = frappe.get_all(
		"Attendance Exception Approver",
		filters={"parent": ["in", names]},
		fields=["parent", "approver", "decision", "reason"],
	)
	by_parent = {}
	for a in appr:
		by_parent.setdefault(a.parent, []).append({
			"approver": a.approver,
			"decision": a.decision,
			"reason": a.reason,
		})
	for e in excs:
		rows = by_parent.get(e["name"], [])
		e["approvers"] = rows
		e["approved_count"] = sum(1 for r in rows if r["decision"] == "Approved")
		e["total"] = len(rows)
	return excs


@frappe.whitelist()
def hr_pending_exceptions():
	"""Every request still awaiting an HR verdict, with the leaders' advisory
	votes attached so HR can read them on the card."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	if not _is_hr(user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	names = [
		r.name for r in frappe.get_all(
			"Attendance Exception",
			filters={"hr_decision": "Pending"},
			fields=["name"],
			limit_page_length=0,
		)
	]
	return {"status": "ok", "rows": _shape_exception_rows(names)}


@frappe.whitelist()
def pending_exception_approvals():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	mine = frappe.get_all(
		"Attendance Exception Approver",
		filters={"approver": user, "decision": "Pending"},
		fields=["parent"],
	)
	names = list({r.parent for r in mine})
	# only surface parents still Pending overall
	rows = [e for e in _shape_exception_rows(names) if e["status"] == "Pending"]
	return {"status": "ok", "rows": rows}


@frappe.whitelist()
def my_exceptions(limit=30):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	names = [
		r.name for r in frappe.get_all(
			"Attendance Exception",
			filters={"employee": user},
			fields=["name"],
			order_by="from_date desc",
			limit=min(cint(limit), 200),
		)
	]
	return {"status": "ok", "rows": _shape_exception_rows(names)}
