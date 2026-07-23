# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

"""Recruitment: job openings, public applications (CV + in-form test), HR review.

Public trust boundary — the guest endpoints validate everything and never leak a
test's correct answers. KTP + CV are permlevel-1 on Job Application; applicants
submit them via `ignore_permissions=True` but only HR can read them back.
"""

import json
import os
import re

import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils import now_datetime, today

from vernon_project.api import recruitment_instruments as ri

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_NAME_MAX = 140
_FIELD_MAX = 140
_TEXT_MAX = 8000

ALLOWED_CV_EXT = (".pdf", ".doc", ".docx")
ALLOWED_CV_MIME = (
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
)
MAX_CV_BYTES = 10 * 1024 * 1024

MCQ_TYPES = ("Multiple Choice", "True/False")
STATUSES = ("Submitted", "Screening", "Interview", "Offered", "Hired", "Rejected")

JOB_LIST_FIELDS = ["name", "slug", "title", "brand", "location", "employment_type", "posted_on", "closes_on"]
APP_LIST_FIELDS = [
	"name", "job_opening", "full_name", "email", "phone", "status", "score", "max_score",
	"grading_status", "blacklist_flag", "submitted_on", "interview_at",
	"overall_fit", "disc_type",
]


# ---------------------------------------------------------------- pure helpers

def _slugify(text):
	"""URL-safe slug: lowercase, non-alnum → '-', collapse, trim."""
	s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
	return s or "job"


def _normalize_wa(phone):
	"""Indonesian phone → wa.me digits. 08xx/8xx/+62/62 → 62xxxxxxxxxx. '' if implausible."""
	d = re.sub(r"\D", "", phone or "")
	if d.startswith("0"):
		d = "62" + d[1:]
	elif d.startswith("8"):
		d = "62" + d
	elif d.startswith("620"):
		d = "62" + d[3:]
	if not d.startswith("62") or len(d) < 10:
		return ""
	return d


def _split_options(text):
	return [ln.strip() for ln in (text or "").splitlines() if ln.strip()]


def _score_answers(questions, answers):
	"""Grade submitted answers against question defs. Pure — unit-testable.

	questions: [{question_text, qtype, correct_answer, points}]
	answers:   list aligned by index, each a str (the applicant's answer).
	Returns (rows, score, max_score, grading_status).
	"""
	rows = []
	score = 0.0
	max_score = 0.0
	needs_grading = False
	for i, q in enumerate(questions):
		ans = ""
		if i < len(answers):
			ans = (answers[i] or "").strip() if isinstance(answers[i], str) else str(answers[i] or "")
		pts = int(q.get("points") or 0)
		max_score += pts
		row = {"question_text": q.get("question_text"), "qtype": q.get("qtype"),
			"answer": ans, "max_points": pts}
		if q.get("qtype") in MCQ_TYPES:
			correct = (q.get("correct_answer") or "").strip()
			ok = bool(ans) and ans == correct
			row["is_correct"] = 1 if ok else 0
			row["points_awarded"] = pts if ok else 0
			score += row["points_awarded"]
		else:  # Free Text — pending manual grade
			row["is_correct"] = 0
			row["points_awarded"] = None
			needs_grading = True
		rows.append(row)
	return rows, score, max_score, ("Needs Grading" if needs_grading else "Auto-scored")


def _enabled_tests(opening):
	return {"disc": bool(opening.get("test_disc")),
			"personality": bool(opening.get("test_personality")),
			"logical": bool(opening.get("test_logical")),
			"ketelitian": bool(opening.get("test_ketelitian"))}


def _overall_fit(disc_fit, personality_fit, scores, enabled):
	"""Mean of enabled contributors: disc_fit, personality_fit, and % of each aptitude test."""
	parts = []
	if enabled["disc"] and disc_fit is not None:
		parts.append(disc_fit)
	if enabled["personality"] and personality_fit is not None:
		parts.append(personality_fit)
	for k in ("logical", "ketelitian"):
		if enabled.get(k):
			s, m = scores.get(k, (0, 0))
			if m:
				parts.append(100.0 * s / m)
	return round(sum(parts) / len(parts), 1) if parts else None


TIMED_TESTS = ("jobspecific", "disc", "personality", "logical", "ketelitian")
TIME_FIELD = {"jobspecific": "time_jobspecific", "disc": "time_disc", "personality": "time_personality",
			  "logical": "time_logical", "ketelitian": "time_ketelitian"}
GRACE_SEC = 15
ATTEMPT_TTL = 4 * 3600  # stamps must survive a whole attempt


def _already_applied(opening_name, nik, email):
	if nik and frappe.db.exists("Job Application", {"job_opening": opening_name, "nik_ktp": nik}):
		return True
	if email and frappe.db.exists("Job Application", {"job_opening": opening_name, "email": email}):
		return True
	return False


def _clean_attempt(attempt_id):
	return re.sub(r"[^A-Za-z0-9-]", "", attempt_id or "")[:64]


def _test_timing(attempt_id, opening, enabled):
	"""Recompute per-test elapsed from server-stamped start/end. Never trusts the client clock."""
	now = now_datetime().timestamp()
	cache = frappe.cache()
	out = {}
	for t in TIMED_TESTS:
		on = (t == "jobspecific" and opening.questions) or enabled.get(t)
		if not on:
			continue
		limit_sec = int(opening.get(TIME_FIELD[t]) or 0) * 60
		if not limit_sec:
			continue
		raw = cache.get_value(f"recruit_timer:{attempt_id}:{t}")
		if not raw:
			out[t] = {"elapsed": None, "limit": limit_sec, "expired": True}
			continue
		start_at = float((json.loads(raw) if isinstance(raw, (str, bytes)) else raw)["start_at"])
		endraw = cache.get_value(f"recruit_timer:{attempt_id}:{t}:end")
		end_at = float((json.loads(endraw) if isinstance(endraw, (str, bytes)) else endraw)["end_at"]) if endraw else now
		elapsed = round(end_at - start_at)
		out[t] = {"elapsed": elapsed, "limit": limit_sec, "expired": elapsed > limit_sec + GRACE_SEC}
	return out


# ------------------------------------------------------------------- HR guard

def _require_hr():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	roles = frappe.get_roles(user)
	if "HR Manager" not in roles and "System Manager" not in roles:
		frappe.throw("Not permitted", frappe.PermissionError)
	return user


# --------------------------------------------------------------- public / guest

@frappe.whitelist(allow_guest=True)
def list_open_jobs():
	return frappe.get_all("Job Opening", filters={"status": "Open"}, fields=JOB_LIST_FIELDS,
		order_by="posted_on desc, creation desc")


@frappe.whitelist(allow_guest=True)
@rate_limit(key="can_apply", limit=30, seconds=3600)
def check_can_apply(job, nik_ktp=None, email=None):
	name = frappe.db.get_value("Job Opening", {"slug": job, "status": "Open"}, "name")
	if not name:
		return {"ok": False, "reason": "Lowongan tidak ditemukan atau sudah ditutup."}
	if _already_applied(name, (nik_ktp or "").strip(), (email or "").strip()):
		return {"ok": False, "reason": "Kamu sudah pernah melamar posisi ini."}
	return {"ok": True}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(key="start_test", limit=120, seconds=3600)
def start_test(attempt_id, job, test, prev=None):
	attempt_id = _clean_attempt(attempt_id)
	if not attempt_id:
		frappe.throw("Sesi tes tidak valid.")
	if test not in TIMED_TESTS:
		frappe.throw("Tes tidak dikenal.")
	name = frappe.db.get_value("Job Opening", {"slug": job, "status": "Open"}, "name")
	if not name:
		frappe.throw("Lowongan tidak ditemukan.", frappe.DoesNotExistError)
	limit_sec = int(frappe.db.get_value("Job Opening", name, TIME_FIELD[test]) or 0) * 60
	key = f"recruit_timer:{attempt_id}:{test}"
	cache = frappe.cache()
	now = now_datetime().timestamp()
	if prev and prev in TIMED_TESTS and prev != test:
		endkey = f"recruit_timer:{attempt_id}:{prev}:end"
		if not cache.get_value(endkey):
			cache.set_value(endkey, json.dumps({"end_at": now}), expires_in_sec=ATTEMPT_TTL)
	raw = cache.get_value(key)
	if raw:
		data = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
		remaining = max(0, int(data["limit_sec"] - (now - float(data["start_at"]))))
		return {"remaining_sec": remaining, "limit_sec": int(data["limit_sec"])}
	data = {"start_at": now, "limit_sec": limit_sec}
	cache.set_value(key, json.dumps(data), expires_in_sec=ATTEMPT_TTL)
	return {"remaining_sec": limit_sec, "limit_sec": limit_sec}


@frappe.whitelist(allow_guest=True)
def get_job(slug):
	name = frappe.db.get_value("Job Opening", {"slug": slug, "status": "Open"}, "name")
	if not name:
		frappe.throw("Job not found", frappe.DoesNotExistError)
	doc = frappe.get_doc("Job Opening", name)
	# NB: never expose correct_answer / points — this is the public test.
	questions = [{"idx": i, "question_text": q.question_text, "qtype": q.qtype,
		"options": _split_options(q.options)} for i, q in enumerate(doc.questions)]
	tests = _enabled_tests(doc)
	return {
		"name": doc.name, "slug": doc.slug, "title": doc.title, "brand": doc.brand,
		"location": doc.location, "employment_type": doc.employment_type,
		"description": doc.description, "requirements": doc.requirements,
		"posted_on": str(doc.posted_on) if doc.posted_on else None,
		"closes_on": str(doc.closes_on) if doc.closes_on else None,
		"questions": questions,
		"test_disc": 1 if tests["disc"] else 0,
		"test_personality": 1 if tests["personality"] else 0,
		"test_logical": 1 if tests["logical"] else 0,
		"disc_items": ri.public_disc() if tests["disc"] else [],
		"bigfive_items": ri.public_bigfive() if tests["personality"] else [],
		"logic_items": ri.public_logic() if tests["logical"] else [],
		"test_ketelitian": 1 if tests["ketelitian"] else 0,
		"ketelitian_items": ri.public_ketelitian() if tests["ketelitian"] else [],
		"time_limits": {t: int(doc.get(TIME_FIELD[t]) or 0) for t in TIMED_TESTS},
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(key="job_application", limit=6, seconds=3600)
def submit_application(job=None, full_name=None, email=None, phone=None, nik_ktp=None,
					   cover_letter=None, answers=None, company_website=None,
					   disc_answers=None, personality_answers=None, logical_answers=None,
					   ketelitian_answers=None, attempt_id=None, violations=None, violation_reasons=None):
	if (company_website or "").strip():
		return {"ok": True}  # honeypot — silently drop bots

	full_name = " ".join((full_name or "").split())
	email = (email or "").strip()
	phone = (phone or "").strip()
	nik_ktp = (nik_ktp or "").strip()
	cover_letter = (cover_letter or "").strip()

	if not (job and full_name and email and phone and nik_ktp):
		frappe.throw("Mohon lengkapi nama, email, telepon, dan NIK.")
	if len(full_name) > _NAME_MAX or len(email) > _FIELD_MAX or len(phone) > _FIELD_MAX \
			or len(nik_ktp) > _FIELD_MAX or len(cover_letter) > _TEXT_MAX:
		frappe.throw("Isian terlalu panjang.")
	if not _EMAIL_RE.match(email):
		frappe.throw("Alamat email belum benar.")

	name = frappe.db.get_value("Job Opening", {"slug": job, "status": "Open"}, "name")
	if not name:
		frappe.throw("Lowongan tidak ditemukan atau sudah ditutup.", frappe.DoesNotExistError)
	opening = frappe.get_doc("Job Opening", name)

	if _already_applied(name, nik_ktp, email):
		frappe.throw("Kamu sudah pernah melamar posisi ini.")

	try:
		submitted = json.loads(answers) if isinstance(answers, str) else (answers or [])
	except ValueError:
		submitted = []
	qdefs = [{"question_text": q.question_text, "qtype": q.qtype,
		"correct_answer": q.correct_answer, "points": q.points} for q in opening.questions]
	rows, score, max_score, grading_status = _score_answers(qdefs, submitted)

	tests = _enabled_tests(opening)

	def _loadjson(v, default):
		try:
			return json.loads(v) if isinstance(v, str) else (v if v is not None else default)
		except ValueError:
			return default

	# tag existing job-specific rows
	for r in rows:
		r["test"] = "Job-Specific"

	logical_score = logical_max = 0.0
	if tests["logical"]:
		la = _loadjson(logical_answers, [])
		la = la if isinstance(la, list) else []
		lrows, ls, lm, _ = _score_answers(ri.logic_qdefs(), la)
		for r in lrows:
			r["test"] = "Logical"
		if len(la) < len(ri.LOGIC_ITEMS):
			frappe.throw("Mohon jawab semua soal tes logika.")
		rows += lrows
		logical_score, logical_max = ls, lm
		score += ls
		max_score += lm

	ketelitian_score = ketelitian_max = 0.0
	if tests["ketelitian"]:
		ka = _loadjson(ketelitian_answers, [])
		ka = ka if isinstance(ka, list) else []
		krows, ks, km, _ = _score_answers(ri.ketelitian_qdefs(), ka)
		for r in krows:
			r["test"] = "Ketelitian"
		if len(ka) < len(ri.KETELITIAN_ITEMS):
			frappe.throw("Mohon jawab semua soal tes ketelitian.")
		rows += krows
		ketelitian_score, ketelitian_max = ks, km
		score += ks
		max_score += km

	psych = {}
	disc_type = None
	disc_fit = personality_fit = None
	if tests["disc"]:
		da = _loadjson(disc_answers, {})
		da = da if isinstance(da, dict) else {}
		def _disc_done(a):
			return isinstance(a, dict) and a.get("most") is not None and a.get("least") is not None
		if sum(1 for it in ri.DISC_ITEMS if _disc_done(da.get(it["id"]))) < len(ri.DISC_ITEMS):
			frappe.throw("Mohon lengkapi tes DISC.")
		dscores, disc_type = ri.score_disc(da)
		disc_fit = ri.fit(dscores, {
			"D": opening.target_d, "I": opening.target_i,
			"S": opening.target_s, "C": opening.target_c}, ri.DISC_AXES)
		psych["disc"] = {"answers": da, "scores": dscores, "type": disc_type, "fit": disc_fit}
	if tests["personality"]:
		pa = _loadjson(personality_answers, {})
		pa = pa if isinstance(pa, dict) else {}
		if len([1 for it in ri.BIGFIVE_ITEMS if pa.get(it["id"]) is not None]) < len(ri.BIGFIVE_ITEMS):
			frappe.throw("Mohon lengkapi tes kepribadian.")
		pscores = ri.score_bigfive(pa)
		personality_fit = ri.fit(pscores, {
			"O": opening.target_o, "C": opening.target_c_big, "E": opening.target_e,
			"A": opening.target_a, "N": opening.target_n}, ri.BIGFIVE_TRAITS)
		psych["personality"] = {"answers": pa, "scores": pscores, "fit": personality_fit}

	overall_fit = _overall_fit(disc_fit, personality_fit,
							   {"logical": (logical_score, logical_max),
								"ketelitian": (ketelitian_score, ketelitian_max)}, tests)

	# timing + proctor violations — computed server-side, never trust the client clock.
	aid = _clean_attempt(attempt_id)
	timing = _test_timing(aid, opening, tests) if aid else {}
	try:
		vcount = max(0, min(int(violations or 0), 100000))
	except (TypeError, ValueError):
		vcount = 0
	vreasons = _loadjson(violation_reasons, [])
	vreasons = [str(x)[:60] for x in vreasons] if isinstance(vreasons, list) else []
	vdetail = ", ".join(sorted(set(vreasons)))[:1000]

	# CV file — private, PDF/doc only (no HTML/SVG stored-XSS).
	try:
		f = frappe.request.files.get("cv")
	except Exception:
		f = None  # no request context (e.g. console) — CV simply absent
	content = fname = None
	if f:
		fname = f.filename or "cv"
		ext = os.path.splitext(fname)[1].lower()
		if ext not in ALLOWED_CV_EXT:
			frappe.throw("Format CV harus PDF, DOC, atau DOCX.")
		mimetype = (getattr(f, "mimetype", "") or "").lower()
		if mimetype and mimetype not in ALLOWED_CV_MIME:
			frappe.throw("Format CV harus PDF, DOC, atau DOCX.")
		content = f.stream.read()
		if len(content) > MAX_CV_BYTES:
			frappe.throw("Ukuran CV maksimal 10 MB.")

	# Save + validate the CV BEFORE inserting the application: Frappe's
	# File.before_insert runs the PDF/JS safety check, so a corrupt or unsafe
	# file throws here — nothing is orphaned and the applicant can retry.
	cv_url = cv_file = None
	if content is not None:
		from frappe.utils.file_manager import save_file
		try:
			saved = save_file(fname, content, None, None, is_private=1)
		except Exception:
			frappe.throw("File CV tidak dapat diproses. Unggah PDF, DOC, atau DOCX yang valid.")
		cv_url, cv_file = saved.file_url, saved.name

	bl_reason = frappe.db.get_value("Recruitment Blacklist", {"nik_ktp": nik_ktp}, "reason")
	applicant_user = frappe.session.user if frappe.session.user != "Guest" else None

	app = frappe.get_doc({
		"doctype": "Job Application",
		"job_opening": name, "full_name": full_name, "email": email, "phone": phone,
		"nik_ktp": nik_ktp, "cover_letter": cover_letter, "applicant_user": applicant_user,
		"cv": cv_url, "status": "Submitted", "submitted_on": now_datetime(),
		"score": score, "max_score": max_score, "grading_status": grading_status,
		"blacklist_flag": 1 if bl_reason else 0, "blacklist_reason": bl_reason or "",
		"answers": rows,
		"psych_result": json.dumps(psych) if psych else None,
		"disc_type": disc_type, "disc_fit": disc_fit, "personality_fit": personality_fit,
		"logical_score": logical_score, "logical_max": logical_max, "overall_fit": overall_fit,
		"attempt_id": aid,
		"ketelitian_score": ketelitian_score, "ketelitian_max": ketelitian_max,
		"test_timing": json.dumps(timing) if timing else None,
		"test_violations": vcount, "violation_detail": vdetail,
	})
	app.insert(ignore_permissions=True)

	# Link the private CV to the application so HR (who can read the application)
	# can open the file through Frappe's attachment permission.
	if cv_file:
		frappe.db.set_value("File", cv_file,
			{"attached_to_doctype": "Job Application", "attached_to_name": app.name,
			 "attached_to_field": "cv"}, update_modified=False)

	frappe.db.commit()
	return {"ok": True, "application": app.name}


# ------------------------------------------------------------------- HR: openings

@frappe.whitelist()
def list_openings():
	_require_hr()
	rows = frappe.get_all("Job Opening",
		fields=["name", "slug", "title", "brand", "location", "employment_type", "status",
			"posted_on", "closes_on"],
		order_by="modified desc")
	counts = {}
	for r in frappe.db.sql(
		"select job_opening, count(*) c from `tabJob Application` group by job_opening", as_dict=True):
		counts[r.job_opening] = r.c
	for r in rows:
		r["application_count"] = counts.get(r["name"], 0)
	return rows


@frappe.whitelist()
def get_opening(name):
	_require_hr()
	doc = frappe.get_doc("Job Opening", name)
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def save_opening(name=None, title=None, brand=None, location=None, employment_type=None,
				 description=None, requirements=None, status=None, closes_on=None,
				 slug=None, questions=None, test_disc=None, test_personality=None,
				 test_logical=None, targets=None, test_ketelitian=None, times=None):
	user = _require_hr()
	qrows = json.loads(questions) if isinstance(questions, str) else (questions or [])
	if name:
		doc = frappe.get_doc("Job Opening", name)
	else:
		doc = frappe.new_doc("Job Opening")
	doc.title = (title or doc.title or "").strip()
	if not doc.title:
		frappe.throw("Judul lowongan wajib diisi.")
	if brand is not None:
		doc.brand = brand or None
	doc.location = location or None
	doc.employment_type = employment_type or doc.employment_type or "Full-time"
	doc.description = description or ""
	doc.requirements = requirements or ""
	doc.closes_on = closes_on or None
	# Slug: explicit, else keep existing, else derive from title (deduped).
	if slug:
		doc.slug = _slugify(slug)
	elif not doc.slug:
		doc.slug = _unique_slug(_slugify(doc.title), doc.name)
	new_status = status or doc.status or "Draft"
	if new_status == "Open" and not doc.posted_on:
		doc.posted_on = today()
		doc.posted_by = user
	doc.status = new_status
	doc.set("questions", [{
		"question_text": (q.get("question_text") or "").strip(),
		"qtype": q.get("qtype") or "Multiple Choice",
		"options": q.get("options") or "",
		"correct_answer": q.get("correct_answer") or "",
		"points": int(q.get("points") or 1),
	} for q in qrows if (q.get("question_text") or "").strip()])
	from frappe.utils import cint
	doc.test_disc = cint(test_disc)
	doc.test_personality = cint(test_personality)
	doc.test_logical = cint(test_logical)
	doc.test_ketelitian = cint(test_ketelitian)
	tg = json.loads(targets) if isinstance(targets, str) else (targets or {})
	for f in ("target_d", "target_i", "target_s", "target_c",
			  "target_o", "target_c_big", "target_e", "target_a", "target_n"):
		doc.set(f, cint(tg.get(f, 50)))
	tm = json.loads(times) if isinstance(times, str) else (times or {})
	for f in ("time_jobspecific", "time_disc", "time_personality", "time_logical", "time_ketelitian"):
		if tm.get(f) is not None:
			doc.set(f, cint(tm.get(f)))
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name, "slug": doc.slug}


def _unique_slug(base, exclude):
	slug, i = base, 2
	while True:
		clash = frappe.db.get_value("Job Opening", {"slug": slug, "name": ["!=", exclude or ""]}, "name")
		if not clash:
			return slug
		slug = f"{base}-{i}"
		i += 1


# --------------------------------------------------------------- HR: applications

@frappe.whitelist()
def list_applications(job=None, status=None):
	_require_hr()
	filters = {}
	if job:
		filters["job_opening"] = job
	if status:
		filters["status"] = status
	rows = frappe.get_all("Job Application", filters=filters, fields=APP_LIST_FIELDS,
		order_by="submitted_on desc", limit_page_length=500)
	titles = {}
	for r in rows:
		if r["job_opening"] not in titles:
			titles[r["job_opening"]] = frappe.db.get_value("Job Opening", r["job_opening"], "title")
		r["job_title"] = titles[r["job_opening"]]
		r["wa"] = _normalize_wa(r.get("phone"))
	return rows


@frappe.whitelist()
def list_interviews():
	"""Scheduled interviews as an agenda — the recruitment 'calendar'. Upcoming first."""
	_require_hr()
	rows = frappe.get_all(
		"Job Application",
		filters={"interview_at": ["is", "set"]},
		fields=["name", "job_opening", "full_name", "phone", "status", "interview_at", "interview_notes"],
		order_by="interview_at asc",
		limit_page_length=500,
	)
	titles = {}
	for r in rows:
		if r["job_opening"] not in titles:
			titles[r["job_opening"]] = frappe.db.get_value("Job Opening", r["job_opening"], "title")
		r["job_title"] = titles[r["job_opening"]]
		r["wa"] = _normalize_wa(r.get("phone"))
	return rows


@frappe.whitelist()
def get_application(name):
	_require_hr()
	doc = frappe.get_doc("Job Application", name)
	return {
		"name": doc.name, "job_opening": doc.job_opening,
		"job_title": frappe.db.get_value("Job Opening", doc.job_opening, "title"),
		"full_name": doc.full_name, "email": doc.email, "phone": doc.phone,
		"wa": _normalize_wa(doc.phone), "nik_ktp": doc.nik_ktp, "cv": doc.cv,
		"cover_letter": doc.cover_letter, "applicant_user": doc.applicant_user,
		"status": doc.status, "blacklist_flag": doc.blacklist_flag,
		"blacklist_reason": doc.blacklist_reason,
		"submitted_on": str(doc.submitted_on) if doc.submitted_on else None,
		"score": doc.score, "max_score": doc.max_score, "grading_status": doc.grading_status,
		"interview_at": str(doc.interview_at) if doc.interview_at else None,
		"interview_notes": doc.interview_notes,
		"psych_result": json.loads(doc.psych_result) if doc.psych_result else None,
		"disc_type": doc.disc_type, "disc_fit": doc.disc_fit,
		"personality_fit": doc.personality_fit, "logical_score": doc.logical_score,
		"logical_max": doc.logical_max, "overall_fit": doc.overall_fit,
		"test_disc": frappe.db.get_value("Job Opening", doc.job_opening, "test_disc"),
		"test_personality": frappe.db.get_value("Job Opening", doc.job_opening, "test_personality"),
		"test_logical": frappe.db.get_value("Job Opening", doc.job_opening, "test_logical"),
		"ketelitian_score": doc.ketelitian_score, "ketelitian_max": doc.ketelitian_max,
		"test_violations": doc.test_violations, "violation_detail": doc.violation_detail,
		"test_timing": json.loads(doc.test_timing) if doc.test_timing else None,
		"test_ketelitian": frappe.db.get_value("Job Opening", doc.job_opening, "test_ketelitian"),
		"answers": [{"idx": i, "question_text": a.question_text, "qtype": a.qtype,
			"answer": a.answer, "is_correct": a.is_correct, "points_awarded": a.points_awarded,
			"max_points": a.max_points, "test": a.test} for i, a in enumerate(doc.answers)],
	}


@frappe.whitelist(methods=["POST"])
def grade_application(name, grades):
	"""grades = {idx: points} for Free Text rows. Recomputes score, marks Graded."""
	_require_hr()
	grades = json.loads(grades) if isinstance(grades, str) else (grades or {})
	doc = frappe.get_doc("Job Application", name)
	for i, a in enumerate(doc.answers):
		key = str(i)
		if a.qtype not in MCQ_TYPES and key in grades:
			pts = float(grades[key] or 0)
			a.points_awarded = max(0, min(pts, a.max_points or 0))
	doc.score = sum((a.points_awarded or 0) for a in doc.answers)
	pending = any(a.qtype not in MCQ_TYPES and a.points_awarded is None for a in doc.answers)
	doc.grading_status = "Needs Grading" if pending else "Graded"
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "score": doc.score, "grading_status": doc.grading_status}


@frappe.whitelist(methods=["POST"])
def set_status(name, status):
	_require_hr()
	if status not in STATUSES:
		frappe.throw("Status tidak valid.")
	doc = frappe.get_doc("Job Application", name)
	doc.status = status
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist(methods=["POST"])
def schedule_interview(name, interview_at, interview_notes=None):
	_require_hr()
	doc = frappe.get_doc("Job Application", name)
	doc.interview_at = interview_at
	doc.interview_notes = interview_notes or ""
	if doc.status in ("Submitted", "Screening"):
		doc.status = "Interview"
	# ponytail: interview_at is the source of truth. Surfacing it on the shared
	# calendar/meetings screen is Phase-2 UI work (Meeting needs a Project + an
	# owner/leader guard that doesn't fit recruitment) — decide the hook then.
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}


# ----------------------------------------------------------------- HR: blacklist

@frappe.whitelist()
def list_blacklist():
	_require_hr()
	return frappe.get_all("Recruitment Blacklist",
		fields=["name", "nik_ktp", "full_name", "reason", "blacklisted_by", "blacklisted_on"],
		order_by="blacklisted_on desc")


@frappe.whitelist(methods=["POST"])
def add_blacklist(nik_ktp, full_name=None, reason=None):
	user = _require_hr()
	nik_ktp = (nik_ktp or "").strip()
	if not nik_ktp or not (reason or "").strip():
		frappe.throw("NIK dan alasan wajib diisi.")
	if frappe.db.exists("Recruitment Blacklist", nik_ktp):
		doc = frappe.get_doc("Recruitment Blacklist", nik_ktp)
		doc.reason = reason
		if full_name:
			doc.full_name = full_name
		doc.save(ignore_permissions=True)
	else:
		frappe.get_doc({
			"doctype": "Recruitment Blacklist", "nik_ktp": nik_ktp,
			"full_name": full_name or "", "reason": reason,
			"blacklisted_by": user, "blacklisted_on": today(),
		}).insert(ignore_permissions=True)
	# Retro-flag any existing applications with this KTP.
	for app in frappe.get_all("Job Application", filters={"nik_ktp": nik_ktp}, pluck="name"):
		frappe.db.set_value("Job Application", app,
			{"blacklist_flag": 1, "blacklist_reason": reason}, update_modified=False)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist(methods=["POST"])
def remove_blacklist(nik_ktp):
	_require_hr()
	if frappe.db.exists("Recruitment Blacklist", nik_ktp):
		frappe.delete_doc("Recruitment Blacklist", nik_ktp, ignore_permissions=True)
	for app in frappe.get_all("Job Application", filters={"nik_ktp": nik_ktp}, pluck="name"):
		frappe.db.set_value("Job Application", app,
			{"blacklist_flag": 0, "blacklist_reason": ""}, update_modified=False)
	frappe.db.commit()
	return {"ok": True}


# ------------------------------------------------------------------- self-check

def _selfcheck():
	assert _slugify("Senior Backend Engineer!") == "senior-backend-engineer"
	assert _slugify("  --Multi  space--  ") == "multi-space"
	assert _slugify("") == "job"
	assert _normalize_wa("0812-3456-7890") == "6281234567890"
	assert _normalize_wa("81234567890") == "6281234567890"
	assert _normalize_wa("+62 812 3456 7890") == "6281234567890"
	assert _normalize_wa("123") == ""
	qs = [
		{"question_text": "2+2?", "qtype": "Multiple Choice", "correct_answer": "4", "points": 2},
		{"question_text": "Sky blue?", "qtype": "True/False", "correct_answer": "True", "points": 1},
		{"question_text": "Why hire you?", "qtype": "Free Text", "correct_answer": "", "points": 5},
	]
	rows, score, mx, gs = _score_answers(qs, ["4", "False", "I am great"])
	assert score == 2 and mx == 8, (score, mx)
	assert gs == "Needs Grading"
	assert rows[0]["is_correct"] == 1 and rows[0]["points_awarded"] == 2
	assert rows[1]["is_correct"] == 0 and rows[1]["points_awarded"] == 0
	assert rows[2]["points_awarded"] is None
	# all-MCQ → auto-scored
	_, s2, m2, gs2 = _score_answers(qs[:2], ["4", "True"])
	assert s2 == 3 and m2 == 3 and gs2 == "Auto-scored"
	from vernon_project.api import recruitment_instruments as ri
	# enabled-tests helper filters correctly
	op = frappe._dict({"test_disc": 1, "test_personality": 0, "test_logical": 1})
	assert _enabled_tests(op) == {"disc": True, "personality": False, "logical": True, "ketelitian": False}
	# overall_fit averages only enabled contributors
	assert _overall_fit(70.0, None, {"logical": (8, 10)},
		{"disc": True, "personality": False, "logical": True, "ketelitian": False}) == 75.0
	op2 = frappe._dict({"test_disc": 0, "test_personality": 0, "test_logical": 1, "test_ketelitian": 1})
	assert _enabled_tests(op2) == {"disc": False, "personality": False, "logical": True, "ketelitian": True}
	# overall_fit: logical 8/10=80, ketelitian 9/10=90 → 85
	en = {"disc": False, "personality": False, "logical": True, "ketelitian": True}
	assert _overall_fit(None, None, {"logical": (8, 10), "ketelitian": (9, 10)}, en) == 85.0
	assert _overall_fit(None, None, {}, {"disc": False, "personality": False, "logical": False, "ketelitian": False}) is None
	print("recruitment selfcheck ok")


def _leakcheck():
	"""No scoring key escapes to the guest payload."""
	import json as _j
	blob = _j.dumps({"disc": ri.public_disc(), "big": ri.public_bigfive(),
					 "logic": ri.public_logic(), "ket": ri.public_ketelitian()})
	for banned in ('"axis"', '"trait"', '"reverse"', '"answer"', '"correct_answer"'):
		assert banned not in blob, banned
	print("recruitment leakcheck ok")


if __name__ == "__main__":
	_selfcheck()
	_leakcheck()
