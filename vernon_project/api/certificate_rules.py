# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Certificate state machine, published snapshot, and the public verification payload.
#
# Pure: plain dicts in, plain dicts out, no frappe import. api/certificate.py does the
# DB work and calls in here for every decision, so the rules that decide whether a piece
# of paper is real are all testable without a bench.

import json
import secrets

from vernon_project.api.intern_score import rubric_display

DRAFT = "Draft"
PENDING = "Pending HR"
PUBLISHED = "Published"
REVOKED = "Revoked"

STATUSES = (DRAFT, PENDING, PUBLISHED, REVOKED)

# Who may drive each move. "hr" = HR Manager or System Manager; "leader" = a leader on
# one of the intern's projects. Publishing is the only step that makes a certificate
# real, so it is HR's alone.
_MOVES = {
	(DRAFT, PENDING): ("leader", "hr"),
	(DRAFT, PUBLISHED): ("hr",),
	(PENDING, PUBLISHED): ("hr",),
	(PENDING, DRAFT): ("leader", "hr"),
	(PUBLISHED, REVOKED): ("hr",),
}

_REASON = {
	"hr": "Hanya HR yang dapat menerbitkan atau mencabut sertifikat.",
	"leader": "Hanya pembimbing magang atau HR yang dapat mengubah sertifikat ini.",
}


class Verdict:
	__slots__ = ("ok", "reason")

	def __init__(self, ok, reason=""):
		self.ok = ok
		self.reason = reason

	def __bool__(self):
		return self.ok

	def __repr__(self):
		return f"Verdict(ok={self.ok!r}, reason={self.reason!r})"


def is_hr(roles):
	roles = roles or []
	return "HR Manager" in roles or "System Manager" in roles


def can_transition(current, target, roles=None, is_leader=False):
	"""Whether this caller may move a certificate from `current` to `target`."""
	roles = roles or []
	if current not in STATUSES or target not in STATUSES:
		return Verdict(False, "Status sertifikat tidak dikenal.")
	if current == REVOKED:
		# One way on purpose: un-revoking would mean a certificate someone was told is
		# void quietly becomes valid again.
		return Verdict(False, "Sertifikat sudah dicabut dan tidak dapat diaktifkan kembali.")
	if current == PUBLISHED and target != REVOKED:
		return Verdict(False, "Sertifikat yang sudah terbit tidak dapat diubah, hanya dicabut.")

	allowed = _MOVES.get((current, target))
	if not allowed:
		return Verdict(False, "Perubahan status ini tidak diperbolehkan.")

	if is_hr(roles):
		return Verdict(True)
	if "leader" in allowed and is_leader:
		return Verdict(True)
	return Verdict(False, _REASON["hr" if allowed == ("hr",) else "leader"])


def next_actions(current, roles=None, is_leader=False):
	"""Target statuses this caller may move to right now — drives which buttons render,
	so the UI and the server can never disagree about what is possible."""
	return [t for t in STATUSES if can_transition(current, t, roles=roles, is_leader=is_leader).ok]


def validate_period(start, end):
	"""None when the period is usable, else a Bahasa message."""
	if not start or not end:
		return "Tanggal mulai dan tanggal selesai magang wajib diisi."
	if str(end)[:10] < str(start)[:10]:
		return "Tanggal selesai tidak boleh lebih awal dari tanggal mulai."
	return None


def make_cert_no(year, sequence):
	"""Human-facing number printed on the paper. Zero-padded to 4 so early certificates
	line up in a list; longer sequences simply grow past the padding."""
	return f"VRN/CERT/{int(year)}/{int(sequence):04d}"


def make_verify_code():
	"""The public lookup key. Knowing it IS the permission to read the certificate, so
	it must be unguessable — 22 url-safe chars is ~128 bits. `cert_no` is sequential and
	is deliberately NOT the key."""
	return secrets.token_urlsafe(16)[:22]


def build_snapshot(auto=None, rubric_rows=None):
	"""What gets frozen onto a certificate at publish time.

	After this the certificate never recomputes: the intern's todos can be edited,
	reassigned or deleted and the paper in their hand still matches the QR."""
	from vernon_project.api.intern_score import compute_rubric_score, split_grade

	auto = auto or {"auto_score": None, "grade": None, "components": []}
	auto_score = auto.get("auto_score")
	rubric_score = compute_rubric_score(rubric_rows)
	grades = split_grade(auto_score, rubric_score)

	# ponytail: json.dumps deep-copies, so a later edit to the live components list
	# cannot reach back into a published certificate.
	return {
		"auto_score": auto_score,
		"rubric_score": rubric_score,
		"auto_grade": grades["auto_grade"],
		"rubric_grade": grades["rubric_grade"],
		"breakdown_json": json.dumps(
			{"auto_score": auto_score, "grade": auto.get("grade"),
				"components": auto.get("components") or []},
			ensure_ascii=False),
	}


def _components(raw):
	try:
		return (json.loads(raw) or {}).get("components") or []
	except (TypeError, ValueError):
		return []


_BLANK = {
	"state": "not_found", "cert_no": None, "intern_name": None, "position": None,
	"project_name": None, "period_start": None, "period_end": None, "issued_on": None,
	"auto_score": None, "rubric_score": None, "auto_grade": None, "rubric_grade": None,
	"summary": None, "components": [], "rubric": [],
	"revoked_on": None, "revoke_reason": None,
}


def build_verify_payload(cert):
	"""Exactly what the public /verify page may show. Anything not listed here — the
	intern's user id, the docname, who published it — never leaves the server.

	Three states, and the difference matters to whoever scanned the QR:
	  valid      — this certificate is real
	  revoked    — we issued it and later voided it (identity kept, scores withheld)
	  not_found  — we have no published certificate with that code

	A Draft or Pending certificate reads as not_found: an unissued certificate must not
	be confirmable, not even as "it exists"."""
	out = dict(_BLANK)
	if not cert or cert.get("status") not in (PUBLISHED, REVOKED):
		return out

	out.update({
		"cert_no": cert.get("cert_no"),
		"intern_name": cert.get("intern_name"),
		"position": cert.get("position"),
		"project_name": cert.get("project_name"),
		"period_start": cert.get("period_start"),
		"period_end": cert.get("period_end"),
		"issued_on": cert.get("issued_on"),
	})

	if cert.get("status") == REVOKED:
		out["state"] = "revoked"
		out["revoked_on"] = cert.get("revoked_on")
		out["revoke_reason"] = cert.get("revoke_reason")
		return out   # scores withheld: a void certificate should not keep advertising a grade

	out.update({
		"state": "valid",
		"auto_score": cert.get("auto_score"),
		"rubric_score": cert.get("rubric_score"),
		"auto_grade": cert.get("auto_grade"),
		"rubric_grade": cert.get("rubric_grade"),
		"summary": cert.get("summary"),
		"components": _components(cert.get("breakdown_json")),
		# rubric_display turns an unjudged line back into score=None, so the public page
		# shows a dash instead of a zero that would read as a damning verdict.
		"rubric": rubric_display(cert.get("rubric")),
	})
	return out
