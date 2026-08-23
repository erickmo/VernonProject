# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Internship certificates: the DB layer.
#
# All the judgement lives next door in two pure modules — intern_score.py (what the
# numbers mean) and certificate_rules.py (who may do what, and what the public may
# see). This file only reads rows, calls in there, and writes the result back.
#
# Design note: the auto score is NEVER stored while a certificate is live. It is
# recomputed on every read, so a leader always sees today's truth. At publish time it
# is frozen into the row, and from then on the certificate never recomputes — the paper
# in someone's hand can never disagree with the QR they scan.

import json

import frappe
from frappe.utils import getdate, nowdate

from vernon_project.api.certificate_rules import (
	DRAFT, PENDING, PUBLISHED, REVOKED,
	build_snapshot, build_verify_payload, can_transition, is_hr,
	make_cert_no, make_verify_code, next_actions, validate_period,
)
from vernon_project.api.intern_score import (
	RUBRIC, attendance_from_rows, compute_auto_score, compute_rubric_score,
	courses_from_rows, point_target, points_from_rows, rubric_display, split_grade,
)
from vernon_project.api.qr import qr_data_uri, verify_url
from vernon_project.api.report import _projects_i_run, _users_on_projects

DOCTYPE = "Internship Certificate"

# One anchor date per todo — the day it belongs to. done-date first (that is when the
# work landed), then its deadline, then when it was created. Without a single anchor a
# todo could fall inside or outside the period depending on which column you looked at.
TODO_ANCHOR = "COALESCE(todo.done_started_at, todo.developed_at, todo.deadline, todo.creation)"

LIST_FIELDS = ("name", "intern", "project", "position", "period_start", "period_end",
	"status", "cert_no", "verify_code", "issued_on", "auto_score", "rubric_score",
	"auto_grade", "rubric_grade", "modified")


# --- permissions --------------------------------------------------------------------

def _scope(user):
	"""(scope, allowed_intern_ids). HR/System Manager see every certificate; someone who
	runs a project sees the interns on it; everyone else sees only their own."""
	if is_hr(frappe.get_roles(user)):
		return "all", None
	projects = _projects_i_run(user)
	if projects:
		return "team", (_users_on_projects(projects) | {user})
	return "self", {user}


def _leads(intern, user):
	"""Whether `user` runs a project `intern` is on — i.e. may draft their certificate."""
	projects = _projects_i_run(user)
	return bool(projects) and intern in _users_on_projects(projects)


def _may_read(cert, user):
	if cert.get("intern") == user:
		return True
	scope, allowed = _scope(user)
	return scope == "all" or (allowed is not None and cert.get("intern") in allowed)


def _guard_read(cert, user):
	if not _may_read(cert, user):
		frappe.throw("Not permitted", frappe.PermissionError)


# --- score inputs -------------------------------------------------------------------

def _todo_rows(intern, project, start, end):
	return frappe.db.sql(
		f"""
		SELECT todo.status AS status, todo.deadline AS deadline,
		       DATE(COALESCE(todo.done_started_at, todo.developed_at)) AS done_on
		FROM `tabProject Todo` AS todo
		WHERE todo.assigned_to = %(intern)s
		  AND DATE({TODO_ANCHOR}) BETWEEN %(start)s AND %(end)s
		  {"AND todo.project = %(project)s" if project else ""}
		""",
		{"intern": intern, "start": start, "end": end, "project": project}, as_dict=True)


def _score_inputs(intern, project, start, end):
	"""Everything compute_auto_score needs, read once."""
	attendance = frappe.get_all("Daily Attendance",
		filters={"employee": intern, "attendance_date": ["between", [start, end]]},
		fields=["status"])

	points = frappe.get_all("Point Ledger",
		filters={"user": intern, "credited_on": ["between", [start, f"{end} 23:59:59"]]},
		fields=["points_earned"])

	# Enrolled by the end of the period, and not already finished before it began.
	courses = frappe.get_all("Course Enrollment",
		filters={"user": intern, "creation": ["<=", f"{end} 23:59:59"]},
		fields=["status", "completed_on"])
	courses = [c for c in courses
		if not c.get("completed_on") or str(c["completed_on"])[:10] >= str(start)]

	target = point_target(start, end,
		frappe.db.get_single_value("Vernon Settings", "intern_point_target_per_month"))

	return {
		"todos": _todo_rows(intern, project, start, end),
		"attendance": attendance_from_rows(attendance),
		"points": points_from_rows(points, target),
		"courses": courses_from_rows(courses),
	}


def _live_auto(intern, project, start, end):
	return compute_auto_score(**_score_inputs(intern, project, start, end))


# --- reads --------------------------------------------------------------------------

@frappe.whitelist()
def certificate_access():
	"""Whether the caller may issue certificates at all, and at what scope. Single
	source for the nav/tile gate, so the UI never offers a screen that 403s."""
	scope, _ = _scope(frappe.session.user)
	return {"can_issue": scope in ("all", "team"), "scope": scope,
		"is_hr": is_hr(frappe.get_roles(frappe.session.user))}


@frappe.whitelist()
def list_certificates(intern=None, status=None):
	"""Certificates the caller may see, newest first."""
	me = frappe.session.user
	scope, allowed = _scope(me)

	filters = {}
	if scope != "all":
		filters["intern"] = ["in", sorted(allowed)]
	if intern:
		filters["intern"] = frappe.utils.cstr(intern)
		_guard_read({"intern": filters["intern"]}, me)
	if status:
		filters["status"] = frappe.utils.cstr(status)

	rows = frappe.get_all(DOCTYPE, filters=filters, fields=list(LIST_FIELDS),
		order_by="modified desc", limit_page_length=200)

	names = {r["intern"] for r in rows} | {r["project"] for r in rows if r.get("project")}
	full = {u.name: u.full_name for u in frappe.get_all(
		"User", filters={"name": ["in", sorted(n for n in names if n and "@" in n)]},
		fields=["name", "full_name"])} if names else {}
	projects = {p.name: p.project_name for p in frappe.get_all(
		"Project", filters={"name": ["in", sorted(r["project"] for r in rows if r.get("project"))]},
		fields=["name", "project_name"])} if any(r.get("project") for r in rows) else {}

	for r in rows:
		r["intern_name"] = full.get(r["intern"]) or r["intern"]
		r["project_name"] = projects.get(r.get("project"))
		# A verify code is a public key to the certificate; only ever hand it out for
		# certificates that actually have a public page.
		if r["status"] not in (PUBLISHED, REVOKED):
			r["verify_code"] = None
	return {"rows": rows, "scope": scope}


def _decorate(doc, user):
	"""Doc as the UI wants it: names resolved, live score attached while it still
	matters, and the exact set of buttons this caller may press."""
	d = doc.as_dict()
	d["intern_name"] = frappe.db.get_value("User", doc.intern, "full_name") or doc.intern
	d["project_name"] = frappe.db.get_value("Project", doc.project, "project_name") if doc.project else None

	d["rubric"] = rubric_display([r.as_dict() for r in doc.rubric])

	roles = frappe.get_roles(user)
	d["actions"] = next_actions(doc.status, roles=roles, is_leader=_leads(doc.intern, user))
	d["is_hr"] = is_hr(roles)
	d["can_edit"] = doc.status in (DRAFT, PENDING) and (
		is_hr(roles) or _leads(doc.intern, user))

	if doc.status in (PUBLISHED, REVOKED):
		# Frozen. Read the snapshot, never recompute — that is the whole promise.
		d["frozen"] = True
		d["components"] = _frozen_components(doc.breakdown_json)
		d["verify_url"] = verify_url(doc.verify_code) if doc.verify_code else None
	else:
		d["frozen"] = False
		live = _live_auto(doc.intern, doc.project, doc.period_start, doc.period_end)
		d["auto_score"] = live["auto_score"]
		d["auto_grade"] = live["grade"]
		d["components"] = live["components"]
		d["rubric_score"] = compute_rubric_score([r.as_dict() for r in doc.rubric])
		d["rubric_grade"] = split_grade(None, d["rubric_score"])["rubric_grade"]
		d["verify_url"] = None
	return d


def _frozen_components(raw):
	try:
		return (json.loads(raw) or {}).get("components") or []
	except (TypeError, ValueError):
		return []


@frappe.whitelist()
def get_certificate(name):
	doc = frappe.get_doc(DOCTYPE, frappe.utils.cstr(name))
	_guard_read({"intern": doc.intern}, frappe.session.user)
	return _decorate(doc, frappe.session.user)


@frappe.whitelist()
def preview_score(intern, period_start, period_end, project=None):
	"""The auto score for a period, before any certificate exists. Lets a leader see
	what the numbers say while they are still deciding, and lets an intern watch their
	own score during the placement."""
	intern = frappe.utils.cstr(intern)
	me = frappe.session.user
	_guard_read({"intern": intern}, me)

	problem = validate_period(period_start, period_end)
	if problem:
		frappe.throw(problem)

	out = _live_auto(intern, frappe.utils.cstr(project) if project else None,
		str(getdate(period_start)), str(getdate(period_end)))
	out["rubric"] = [{"key": k, "label": lbl, "weight": w, "score": None, "comment": ""}
		for k, lbl, w in RUBRIC]
	return out


# --- writes -------------------------------------------------------------------------

def _guard_write(intern, user):
	if not (is_hr(frappe.get_roles(user)) or _leads(intern, user)):
		frappe.throw("Hanya pembimbing magang atau HR yang dapat membuat sertifikat.",
			frappe.PermissionError)


@frappe.whitelist(methods=["POST"])
def save_certificate(name=None, intern=None, project=None, position=None,
		period_start=None, period_end=None, summary=None, rubric=None):
	"""Create or update a draft. Published certificates are refused here — the only
	thing that may happen to one is revocation."""
	me = frappe.session.user

	if name:
		doc = frappe.get_doc(DOCTYPE, frappe.utils.cstr(name))
		_guard_write(doc.intern, me)
		if doc.status in (PUBLISHED, REVOKED):
			frappe.throw("Sertifikat yang sudah terbit tidak dapat diubah.")
	else:
		intern = frappe.utils.cstr(intern or "")
		if not intern:
			frappe.throw("Peserta magang wajib dipilih.")
		_guard_write(intern, me)
		doc = frappe.new_doc(DOCTYPE)
		doc.intern = intern
		doc.status = DRAFT

	problem = validate_period(period_start, period_end)
	if problem:
		frappe.throw(problem)

	doc.project = frappe.utils.cstr(project) if project else None
	doc.position = frappe.utils.cstr(position or "")
	doc.period_start = getdate(period_start)
	doc.period_end = getdate(period_end)
	doc.summary = frappe.utils.cstr(summary or "")
	_apply_rubric(doc, rubric)

	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _decorate(doc, me)


def _apply_rubric(doc, rubric):
	"""Replace the rubric table from the payload, keeping the code-defined labels and
	weights authoritative. The browser may only set scores and comments — otherwise a
	crafted payload could reweight the rubric it is being judged by."""
	if isinstance(rubric, str):
		try:
			rubric = json.loads(rubric)
		except ValueError:
			rubric = None
	by_key = {r.get("key") or r.get("criteria_key"): r for r in (rubric or []) if isinstance(r, dict)}

	doc.set("rubric", [])
	for key, label, weight in RUBRIC:
		sent = by_key.get(key) or {}
		raw = sent.get("score")
		# A Float column stores None as 0.0, so an unjudged line would come back looking
		# like a zero. `scored` is what keeps "skipped" and "scored zero" apart.
		scored = raw not in ("", None)
		score = max(0.0, min(100.0, frappe.utils.flt(raw))) if scored else 0.0
		doc.append("rubric", {"criteria_key": key, "label": label, "weight": weight,
			"score": score, "scored": 1 if scored else 0,
			"comment": frappe.utils.cstr(sent.get("comment") or "")})


def _next_cert_no():
	"""Sequential within the calendar year. Read-then-write, so it relies on the row
	lock frappe takes on insert; a collision would trip the unique index on cert_no
	rather than issue two identical numbers."""
	year = getdate(nowdate()).year
	used = frappe.get_all(DOCTYPE, filters={"cert_no": ["like", f"VRN/CERT/{year}/%"]},
		pluck="cert_no")
	highest = 0
	for c in used:
		tail = str(c).rsplit("/", 1)[-1]
		if tail.isdigit():
			highest = max(highest, int(tail))
	return make_cert_no(year, highest + 1)


@frappe.whitelist(methods=["POST"])
def set_certificate_status(name, target, reason=None):
	"""The only door between statuses. Publishing mints the number and the verify code
	and freezes both scores; revoking keeps the row so the QR still resolves."""
	me = frappe.session.user
	doc = frappe.get_doc(DOCTYPE, frappe.utils.cstr(name))
	target = frappe.utils.cstr(target)

	verdict = can_transition(doc.status, target, roles=frappe.get_roles(me),
		is_leader=_leads(doc.intern, me))
	if not verdict.ok:
		frappe.throw(verdict.reason, frappe.PermissionError)

	if target == PUBLISHED:
		_publish(doc, me)
	elif target == REVOKED:
		reason = frappe.utils.cstr(reason or "").strip()
		if not reason:
			frappe.throw("Alasan pencabutan wajib diisi.")
		doc.status = REVOKED
		doc.revoked_on = nowdate()
		doc.revoke_reason = reason
	else:
		doc.status = target

	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _decorate(doc, me)


def _publish(doc, user):
	if frappe.db.exists(DOCTYPE, {"intern": doc.intern, "project": doc.project or "",
			"period_start": doc.period_start, "period_end": doc.period_end,
			"status": PUBLISHED, "name": ["!=", doc.name]}):
		frappe.throw("Sertifikat untuk peserta, proyek dan periode ini sudah pernah terbit.")

	snap = build_snapshot(
		auto=_live_auto(doc.intern, doc.project, doc.period_start, doc.period_end),
		rubric_rows=[r.as_dict() for r in doc.rubric])

	doc.auto_score = snap["auto_score"]
	doc.rubric_score = snap["rubric_score"]
	doc.auto_grade = snap["auto_grade"]
	doc.rubric_grade = snap["rubric_grade"]
	doc.breakdown_json = snap["breakdown_json"]
	doc.cert_no = doc.cert_no or _next_cert_no()
	doc.verify_code = doc.verify_code or make_verify_code()
	doc.issued_on = nowdate()
	doc.published_by = user
	doc.status = PUBLISHED


# --- public verification ------------------------------------------------------------

def lookup_verify(code):
	"""Public payload for a verify code. Deliberately NOT whitelisted: the only caller
	is the server-rendered /verify page, so there is no JSON endpoint to enumerate.

	An unknown code and an unpublished certificate return the same 'not_found' — a draft
	must not be confirmable, not even as 'it exists'."""
	code = frappe.utils.cstr(code or "").strip()
	if not code or len(code) > 64:
		return build_verify_payload(None)

	name = frappe.db.get_value(DOCTYPE, {"verify_code": code}, "name")
	if not name:
		return build_verify_payload(None)

	doc = frappe.get_doc(DOCTYPE, name)
	cert = doc.as_dict()
	cert["intern_name"] = frappe.db.get_value("User", doc.intern, "full_name") or ""
	cert["project_name"] = frappe.db.get_value(
		"Project", doc.project, "project_name") if doc.project else None
	cert["rubric"] = [r.as_dict() for r in doc.rubric]
	return build_verify_payload(cert)


# --- PDF ----------------------------------------------------------------------------

@frappe.whitelist()
def certificate_pdf(name):
	"""The certificate as a PDF. Only a published certificate produces one — a draft is
	refused outright rather than watermarked, because a watermarked draft still ends up
	screenshotted into a CV."""
	doc = frappe.get_doc(DOCTYPE, frappe.utils.cstr(name))
	_guard_read({"intern": doc.intern}, frappe.session.user)

	if doc.status != PUBLISHED:
		frappe.throw("Hanya sertifikat yang sudah terbit dapat diunduh.")

	html = frappe.render_template("templates/certificate_pdf.html", _pdf_context(doc))
	from frappe.utils.pdf import get_pdf

	frappe.local.response.filename = f"{(doc.cert_no or doc.name).replace('/', '-')}.pdf"
	frappe.local.response.filecontent = get_pdf(html, options={
		"page-size": "A4", "orientation": "Landscape",
		"margin-top": "0mm", "margin-bottom": "0mm",
		"margin-left": "0mm", "margin-right": "0mm",
	})
	frappe.local.response.type = "download"


def _pdf_context(doc):
	url = verify_url(doc.verify_code)
	return {
		"doc": doc,
		"intern_name": frappe.db.get_value("User", doc.intern, "full_name") or doc.intern,
		"project_name": frappe.db.get_value(
			"Project", doc.project, "project_name") if doc.project else None,
		"components": _frozen_components(doc.breakdown_json),
		"rubric": rubric_display([r.as_dict() for r in doc.rubric]),
		"qr": qr_data_uri(url, scale=5),
		"verify_url": url,
	}
