# Public certificate verification — the page behind the QR on every internship
# certificate. Guest-readable by design: whoever is holding the paper has no account
# here, and asking them to make one would defeat the point.
#
# The verify code IS the access control. It is 22 random url-safe characters, so the
# page cannot be enumerated, and no sequential id is ever exposed publicly.

import frappe
from frappe import _

from vernon_project.api.certificate import lookup_verify
from vernon_project.attendance.qr import client_ip
from vernon_project.www._i18n import base_context, norm_lang

ROUTE = "/verify"

LOOKUP_LIMIT = 60
LOOKUP_WINDOW = 60 * 60

no_cache = 1

T = {
	"valid": {
		"id": "Sertifikat ini asli",
		"en": "This certificate is authentic",
	},
	"valid_sub": {
		"id": "Diterbitkan oleh Vernon dan tercatat di sistem kami.",
		"en": "Issued by Vernon and recorded in our system.",
	},
	"revoked": {
		"id": "Sertifikat ini telah dicabut",
		"en": "This certificate has been revoked",
	},
	"revoked_sub": {
		"id": "Vernon pernah menerbitkan sertifikat ini, lalu mencabutnya. Sertifikat ini tidak lagi berlaku.",
		"en": "Vernon issued this certificate and later revoked it. It is no longer valid.",
	},
	"not_found": {
		"id": "Sertifikat tidak ditemukan",
		"en": "Certificate not found",
	},
	"not_found_sub": {
		"id": "Tidak ada sertifikat terbit dengan kode ini. Periksa kembali kode atau pindai ulang QR pada sertifikat.",
		"en": "No issued certificate carries this code. Check the code, or scan the QR on the certificate again.",
	},
	"holder": {"id": "Nama", "en": "Name"},
	"position": {"id": "Posisi", "en": "Position"},
	"project": {"id": "Proyek", "en": "Project"},
	"period": {"id": "Masa magang", "en": "Internship period"},
	"cert_no": {"id": "Nomor sertifikat", "en": "Certificate number"},
	"issued_on": {"id": "Tanggal terbit", "en": "Issued on"},
	"revoked_on": {"id": "Dicabut pada", "en": "Revoked on"},
	"revoke_reason": {"id": "Alasan", "en": "Reason"},
	"auto_score": {"id": "Nilai Kinerja", "en": "Performance score"},
	"rubric_score": {"id": "Nilai Penilaian", "en": "Supervisor score"},
	"auto_help": {
		"id": "Dihitung otomatis dari catatan kerja peserta: tugas selesai, ketepatan waktu, kehadiran, poin kontribusi dan pembelajaran. Tidak diketik siapa pun.",
		"en": "Computed from the intern's own record: tasks completed, timeliness, attendance, contribution points and learning. Nobody types it.",
	},
	"rubric_help": {
		"id": "Penilaian pembimbing magang atas hal-hal yang tidak bisa diukur mesin.",
		"en": "The supervisor's judgement of what a machine cannot measure.",
	},
	"why_two": {
		"id": "Kedua nilai sengaja tidak digabung. Menggabungkannya justru menyembunyikan hal yang menarik — peserta dengan angka biasa tetapi dinilai tinggi oleh pembimbing, atau sebaliknya.",
		"en": "The two scores are deliberately not merged. Averaging them would hide the interesting case — an intern with ordinary numbers whom the supervisor rates highly, or the reverse.",
	},
	"breakdown": {"id": "Rincian Nilai Kinerja", "en": "Performance breakdown"},
	"rubric_table": {"id": "Rincian Penilaian Pembimbing", "en": "Supervisor's assessment"},
	"component": {"id": "Komponen", "en": "Component"},
	"achieved": {"id": "Capaian", "en": "Achieved"},
	"weight": {"id": "Bobot", "en": "Weight"},
	"score": {"id": "Nilai", "en": "Score"},
	"note": {"id": "Catatan", "en": "Note"},
	"summary": {"id": "Catatan pembimbing", "en": "Supervisor's note"},
	"what_this_proves": {
		"id": "Halaman ini membuktikan bahwa Vernon menerbitkan sertifikat dengan nomor tersebut untuk orang tersebut. Halaman ini tidak menilai baik-buruknya kinerja — angka di atas yang berbicara.",
		"en": "This page proves Vernon issued that numbered certificate to that person. It does not vouch for how good the work was — the scores above speak for that.",
	},
	"scanned": {
		"id": "Anda memindai QR dari sebuah sertifikat.",
		"en": "You scanned the QR from a certificate.",
	},
	"not_measured": {"id": "tidak diukur", "en": "not measured"},
	"open_app": {"id": "Tentang Vernon", "en": "About Vernon"},
}


def _t(lang):
	return {k: (v.get(lang) or v["id"]) for k, v in T.items()}


def _lookup_budget_spent():
	"""True once this caller has spent LOOKUP_LIMIT code lookups in the window.

	Counted here rather than with frappe's @rate_limit for two reasons, both of which
	made the previous guard useless:

	1. `rate_limit(...)` is a decorator FACTORY. The old line called it as a bare
	   statement inside `except Exception: pass`, which built a decorator, applied it
	   to nothing and threw it away -- so this page has had NO throttle at all, and the
	   bare except guaranteed nobody would ever find out.
	2. Even applied correctly it keys on `frappe.local.request_ip`, which on this site
	   is a CLOUDFLARE EDGE address: every visitor behind one edge shares a bucket, so
	   the limit would throttle strangers together while barely slowing one attacker.
	   client_ip() resolves the real caller behind Cloudflare (see attendance/qr.py).
	"""
	ip = client_ip() or "unknown"
	key = frappe.cache.make_key(f"vp_verify_lookup:{ip}")
	if not frappe.cache.get(key):
		frappe.cache.setex(key, LOOKUP_WINDOW, 0)
	return frappe.cache.incrby(key, 1) > LOOKUP_LIMIT


def get_context(context):
	lang = norm_lang(frappe.form_dict.get("lang"))
	code = frappe.form_dict.get("code") or ""

	base_context(context, "verify", lang, "/verify")

	# Cheap brake on someone walking the keyspace. The code is 128 bits of entropy, so
	# this is belt-and-braces rather than the actual defence.
	if code and _lookup_budget_spent():
		frappe.throw(
			_("Too many verification attempts. Please try again later."),
			frappe.RateLimitExceededError,
		)

	context.t = _t(lang)
	context.cert = lookup_verify(code)
	context.code = code
	context.title = context.t[context.cert["state"]]
	# A verification result is never something to index or share as a landing page.
	context.robots = "noindex, nofollow"
	return context
