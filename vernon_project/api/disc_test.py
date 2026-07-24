# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

"""DISC + personality (Big Five) test reminder endpoints.

Reuses the recruitment instrument engine for question banks + scoring; stores the
result read-only on the caller's Employee Profile. Results are permanent — a
sub-test that has a completed_on is never re-scored (a SysMgr must reset_disc).
"""

import json

import frappe

from vernon_project.api.recruitment_instruments import (
	public_bigfive,
	public_disc,
	score_bigfive,
	score_disc,
)
from vernon_project.vernon_project.doctype.employee_profile.employee_profile import (
	_ensure_employee_profile,
)

_SCOPED = ("Internal Team", "Intern")


def _parse(v):
	"""Untrusted answer blob → dict. Never raises on malformed input."""
	if isinstance(v, str):
		try:
			v = json.loads(v)
		except (ValueError, TypeError):
			return {}
	return v if isinstance(v, dict) else {}


@frappe.whitelist()
def get_disc_reminder():
	"""{enabled, owed, hours} — whether to nudge the caller to take the tests."""
	force = frappe.db.get_single_value("Vernon Settings", "force_disc_reminder")
	hours = frappe.db.get_single_value("Vernon Settings", "disc_reminder_hours")
	enabled = int(bool(force))
	user = frappe.session.user
	owed = 0
	if enabled and user != "Guest":
		member_type = frappe.db.get_value("User", user, "custom_member_type")
		if member_type in _SCOPED:
			doc = _ensure_employee_profile(user)
			if not doc.disc_completed_on or not doc.personality_completed_on:
				owed = 1
	return {"enabled": enabled, "owed": owed, "hours": int(hours or 24)}


@frappe.whitelist()
def get_my_disc():
	"""Caller's own stored results (read-only self-view). Empty dict fields if not done."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	doc = _ensure_employee_profile(user)
	return {
		"disc_type": doc.disc_type,
		"disc_scores": doc.disc_scores,
		"personality_scores": doc.personality_scores,
		"disc_completed_on": doc.disc_completed_on,
		"personality_completed_on": doc.personality_completed_on,
	}


@frappe.whitelist()
def get_disc_questions():
	"""Question banks + per-sub-test done flags for the caller."""
	user = frappe.session.user
	disc_done = personality_done = 0
	if user != "Guest":
		doc = _ensure_employee_profile(user)
		disc_done = int(bool(doc.disc_completed_on))
		personality_done = int(bool(doc.personality_completed_on))
	return {
		"disc": public_disc(),
		"personality": public_bigfive(),
		"disc_done": disc_done,
		"personality_done": personality_done,
	}


@frappe.whitelist()
def submit_disc_test(disc_answers=None, personality_answers=None):
	"""Score + store any not-yet-completed sub-test. Completed sub-tests are permanent."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not permitted", frappe.PermissionError)

	disc_answers = _parse(disc_answers)
	personality_answers = _parse(personality_answers)
	doc = _ensure_employee_profile(user)
	now = frappe.utils.now()

	if not doc.disc_completed_on and disc_answers:
		scores, dom = score_disc(disc_answers)
		doc.disc_scores = json.dumps(scores)
		doc.disc_type = dom
		doc.disc_completed_on = now

	if not doc.personality_completed_on and personality_answers:
		scores = score_bigfive(personality_answers)
		doc.personality_scores = json.dumps(scores)
		doc.personality_completed_on = now

	doc.save(ignore_permissions=True)
	return {
		"disc_type": doc.disc_type,
		"disc_scores": doc.disc_scores,
		"personality_scores": doc.personality_scores,
		"disc_completed_on": doc.disc_completed_on,
		"personality_completed_on": doc.personality_completed_on,
	}


@frappe.whitelist()
def reset_disc(user):
	"""Clear a user's stored results so the reminder returns (System Manager only)."""
	if "System Manager" not in frappe.get_roles(frappe.session.user):
		frappe.throw("Not permitted", frappe.PermissionError)
	doc = _ensure_employee_profile(user)
	for f in ("disc_scores", "disc_type", "disc_completed_on", "personality_scores", "personality_completed_on"):
		doc.set(f, None)
	doc.save(ignore_permissions=True)
	return {"status": "ok"}
