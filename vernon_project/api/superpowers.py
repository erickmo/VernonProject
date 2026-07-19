# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# Superpowers — workspace traits surfaced two ways:
#   1. My Superpowers   — self-claimed (User Superpower rows).
#   2. Peer-Voted       — others score a user 0-10 per trait (Superpower Vote);
#      each trait gets a confidence-weighted level.
#
#   W = (S + prior_mean * K) / (n + K)     # S = sum of n votes, K = confidence_k
#
# A trait's level is the highest band whose min_score <= W. Votes optionally mint
# Recognition points to the ratee (inert by default). Catalog + levels + knobs
# live in the Superpower / Superpower Settings doctypes (System-Manager desk).
# See docs/superpowers/specs/2026-07-19-superpowers-design.md.

import frappe
from frappe.utils import cint, flt, now_datetime, add_days, getdate, nowdate

# Mirrors mobile.py STATUS_COMPLETED (the completed Project Todo status).
_STATUS_COMPLETED = "✅ Completed"
_ATT_ONTIME = ("Present", "EarlyLeave")   # arrived on time
_ATT_LATE = ("Late", "Late+EarlyLeave")   # arrived late
_ATT_ACTIVE = _ATT_ONTIME + _ATT_LATE     # counts as an active/attended day


# --- helpers -------------------------------------------------------------------


def _is_admin():
	return "System Manager" in frappe.get_roles()


def _require_login():
	if frappe.session.user == "Guest":
		frappe.throw("Login required.", frappe.PermissionError)


def _settings():
	"""The Superpower Settings Single doc."""
	return frappe.get_cached_doc("Superpower Settings")


def _levels():
	"""Level bands as plain dicts, sorted by min_score ascending."""
	return sorted(
		[
			{"level_name": lv.level_name, "min_score": flt(lv.min_score), "color": lv.color, "icon": lv.icon}
			for lv in _settings().levels
		],
		key=lambda x: x["min_score"],
	)


def _weighted(S, n, prior_mean, K):
	return (S + prior_mean * K) / (n + K)


def _level_for(W, levels):
	"""Highest band whose min_score <= W, or None if W is below the lowest band."""
	chosen = None
	for lv in levels:  # levels sorted ascending
		if lv["min_score"] <= W:
			chosen = lv
		else:
			break
	return chosen


def _catalog_map(names=None):
	"""{name: catalog row}. Includes disabled traits so vote history still renders."""
	filters = {"name": ["in", list(names)]} if names else {}
	rows = frappe.get_all(
		"Superpower",
		filters=filters,
		fields=["name", "superpower_name", "category", "icon", "color", "description"],
	)
	return {r["name"]: r for r in rows}


def _shape_agg(sp, S, n, my_vote, prior_mean, K, levels, catalog):
	W = _weighted(S, n, prior_mean, K)
	meta = catalog.get(sp) or {}
	level = _level_for(W, levels)
	return {
		"superpower": sp,
		"name": meta.get("superpower_name") or sp,
		"icon": meta.get("icon"),
		"color": meta.get("color"),
		"category": meta.get("category"),
		"avg": round(S / n, 4) if n else 0,
		"count": n,
		"weighted": round(W, 4),
		"level": {"level_name": level["level_name"], "color": level["color"], "icon": level["icon"]} if level else None,
		"my_vote": my_vote,
	}


def _voted_for(ratee, caller):
	"""Aggregate every Superpower Vote for `ratee`, grouped by superpower."""
	votes = frappe.get_all(
		"Superpower Vote", filters={"ratee": ratee}, fields=["superpower", "voter", "score"]
	)
	if not votes:
		return []
	s = _settings()
	prior_mean, K, levels = flt(s.prior_mean), cint(s.confidence_k), _levels()
	catalog = _catalog_map({v["superpower"] for v in votes})
	agg = {}
	for v in votes:
		a = agg.setdefault(v["superpower"], {"sum": 0, "count": 0, "my_vote": None})
		a["sum"] += cint(v["score"])
		a["count"] += 1
		if v["voter"] == caller:
			a["my_vote"] = cint(v["score"])
	return [
		_shape_agg(sp, a["sum"], a["count"], a["my_vote"], prior_mean, K, levels, catalog)
		for sp, a in agg.items()
	]


def _agg_one(ratee, superpower, caller):
	"""Fresh aggregate for a single (ratee, superpower) — same shape as a voted item."""
	votes = frappe.get_all(
		"Superpower Vote",
		filters={"ratee": ratee, "superpower": superpower},
		fields=["voter", "score"],
	)
	s = _settings()
	S = sum(cint(v["score"]) for v in votes)
	n = len(votes)
	my_vote = next((cint(v["score"]) for v in votes if v["voter"] == caller), None)
	return _shape_agg(superpower, S, n, my_vote, flt(s.prior_mean), cint(s.confidence_k), _levels(), _catalog_map([superpower]))


def _mine_for(user):
	rows = frappe.get_all("User Superpower", filters={"user": user}, fields=["superpower"])
	if not rows:
		return []
	catalog = _catalog_map([r["superpower"] for r in rows])
	out = []
	for r in rows:
		meta = catalog.get(r["superpower"]) or {}
		out.append({
			"superpower": r["superpower"],
			"name": meta.get("superpower_name") or r["superpower"],
			"icon": meta.get("icon"),
			"color": meta.get("color"),
			"category": meta.get("category"),
		})
	return out


def _recognition_credit(voter, ratee, superpower):
	"""Mint vote_points to the ratee as a Recognition Point Ledger row. Idempotent
	per (voter, ratee, superpower) via the note key, so re-voting/score-updates never
	farm extra points. Inert when vote_points<=0. Mirrors mobile.py::_recognition_credit."""
	pts = cint(_settings().vote_points)
	if pts <= 0:
		return
	note = f"Superpower: {superpower}"
	if frappe.db.exists(
		"Point Ledger", {"user": ratee, "granted_by": voter, "source": "Recognition", "note": note}
	):
		return
	# ponytail: no weekly per-giver cap (Vernon Settings.recognition_weekly_cap);
	# add it like mobile._recognition_credit if giver farming ever shows up.
	frappe.get_doc({
		"doctype": "Point Ledger",
		"user": ratee,
		"points_earned": pts,
		"source": "Recognition",
		"granted_by": voter,
		"note": note,
		"credited_on": now_datetime(),
	}).insert(ignore_permissions=True)


# --- performance-earned scores -------------------------------------------------


def _score_ontime(user, start):
	"""Punctual attendance: on-time days / attended days over the window."""
	rows = frappe.get_all(
		"Daily Attendance",
		filters={"employee": user, "attendance_date": [">=", start], "status": ["in", list(_ATT_ACTIVE)]},
		fields=["status"],
	)
	total = len(rows)
	on = sum(1 for r in rows if r["status"] in _ATT_ONTIME)
	score = (on / total * 10) if total else 0
	return score, (f"{on}/{total} hari tepat waktu" if total else "Belum ada data absensi")


def _score_beat_deadline(user, start):
	"""Completed todos finished on/before their deadline over the window."""
	rows = frappe.get_all(
		"Project Todo",
		filters={"assigned_to": user, "status": _STATUS_COMPLETED, "completed_at": [">=", start]},
		fields=["completed_at", "deadline"],
	)
	total = len(rows)
	on = sum(1 for r in rows if r.get("deadline") and getdate(r["completed_at"]) <= getdate(r["deadline"]))
	score = (on / total * 10) if total else 0
	return score, (f"{on}/{total} selesai tepat waktu" if total else "Belum ada tugas selesai")


def _active_dates(user, start):
	"""Set of dates the user completed a todo or attended, since `start`."""
	dates = set()
	for r in frappe.get_all(
		"Project Todo",
		filters={"assigned_to": user, "status": _STATUS_COMPLETED, "completed_at": [">=", start]},
		fields=["completed_at"],
	):
		dates.add(getdate(r["completed_at"]))
	for r in frappe.get_all(
		"Daily Attendance",
		filters={"employee": user, "attendance_date": [">=", start], "status": ["in", list(_ATT_ACTIVE)]},
		fields=["attendance_date"],
	):
		dates.add(getdate(r["attendance_date"]))
	return dates


def _score_streak(user, target):
	"""Current consecutive-day activity run ending today or yesterday."""
	start = add_days(nowdate(), -(int(target) + 2))
	active = _active_dates(user, start)
	today = getdate(nowdate())
	cur = today if today in active else (add_days(today, -1) if getdate(add_days(today, -1)) in active else None)
	streak = 0
	d = getdate(cur) if cur else None
	while d and d in active:
		streak += 1
		d = getdate(add_days(d, -1))
	score = min(streak, target) / target * 10 if target else 0
	return score, f"{streak} hari beruntun"


def _score_finisher(user, start, target):
	"""Volume of completed todos over the window, vs a target."""
	count = frappe.db.count(
		"Project Todo",
		{"assigned_to": user, "status": _STATUS_COMPLETED, "completed_at": [">=", start]},
	)
	score = min(count, target) / target * 10 if target else 0
	return score, f"{count} tugas selesai"


def _perf_scores(user):
	"""Compute the enabled Performance superpowers for `user` (live, no scheduler)."""
	s = _settings()
	window = cint(s.perf_window_days) or 30
	start = add_days(nowdate(), -window)
	streak_target = cint(s.streak_target) or 30
	finisher_target = cint(s.finisher_target) or 30
	levels = _levels()
	out = []
	for r in frappe.get_all(
		"Superpower",
		filters={"enabled": 1, "kind": "Performance"},
		fields=["name", "superpower_name", "metric", "icon", "color", "category"],
		order_by="superpower_name asc",
	):
		m = r["metric"]
		if m == "ontime":
			score, detail = _score_ontime(user, start)
		elif m == "beat_deadline":
			score, detail = _score_beat_deadline(user, start)
		elif m == "streak":
			score, detail = _score_streak(user, streak_target)
		elif m == "finisher":
			score, detail = _score_finisher(user, start, finisher_target)
		else:
			score, detail = 0, ""
		score = round(score, 4)
		level = _level_for(score, levels)
		out.append({
			"superpower": r["name"],
			"name": r["superpower_name"],
			"metric": m,
			"icon": r["icon"],
			"color": r["color"],
			"category": r["category"],
			"kind": "Performance",
			"score": score,
			"level": {"level_name": level["level_name"], "color": level["color"], "icon": level["icon"]} if level else None,
			"detail": detail,
		})
	return out


# --- catalog -------------------------------------------------------------------


@frappe.whitelist()
def list_superpowers():
	"""The enabled catalog, for pickers. `kind` lets the UI show only Voted traits
	in the self-claim grid / vote picker."""
	return frappe.get_all(
		"Superpower",
		filters={"enabled": 1},
		fields=["name", "superpower_name", "kind", "metric", "category", "icon", "color", "description"],
		order_by="superpower_name asc",
	)


@frappe.whitelist()
def save_superpower(superpower_name=None, category=None, icon=None, color=None, description=None, enabled=1, name=None):
	"""Admin only. Create a catalog entry, or update the fields of an existing one
	(identified by `name`, or by `superpower_name` when it already exists)."""
	if not _is_admin():
		frappe.throw("Not permitted", frappe.PermissionError)
	key = name or superpower_name
	if key and frappe.db.exists("Superpower", key):
		doc = frappe.get_doc("Superpower", key)
		# superpower_name is the autoname identity — don't rename here.
		doc.category = category
		doc.icon = icon
		doc.color = color
		doc.description = description
		doc.enabled = cint(enabled)
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({
			"doctype": "Superpower",
			"superpower_name": superpower_name,
			"category": category,
			"icon": icon,
			"color": color,
			"description": description,
			"enabled": cint(enabled),
		}).insert(ignore_permissions=True)
	frappe.db.commit()
	return {
		"name": doc.name,
		"superpower_name": doc.superpower_name,
		"category": doc.category,
		"icon": doc.icon,
		"color": doc.color,
		"description": doc.description,
		"enabled": cint(doc.enabled),
	}


@frappe.whitelist()
def delete_superpower(name):
	"""Admin only. Soft delete — disable it, keeping vote history intact."""
	if not _is_admin():
		frappe.throw("Not permitted", frappe.PermissionError)
	if not frappe.db.exists("Superpower", name):
		frappe.throw("Unknown superpower.", frappe.DoesNotExistError)
	frappe.db.set_value("Superpower", name, "enabled", 0)
	frappe.db.commit()
	return {"name": name}


# --- profile -------------------------------------------------------------------


@frappe.whitelist()
def get_user_superpowers(user):
	"""Profile view: self-claimed + peer-voted (with the caller's own vote per trait),
	signature (max-W voted trait) and the 'Superpowered' achievement (top band reached)."""
	_require_login()
	session = frappe.session.user
	mine = _mine_for(user)
	voted = _voted_for(user, session)
	signature = max(voted, key=lambda x: x["weighted"]) if voted else None
	levels = _levels()
	top_name = levels[-1]["level_name"] if levels else None
	achievement = any(it["level"] and it["level"]["level_name"] == top_name for it in voted)
	meta = frappe.db.get_value("User", user, ["full_name", "user_image"], as_dict=True) or {}
	return {
		"user": user,
		"user_name": meta.get("full_name") or user,
		"user_image": meta.get("user_image"),
		"mine": mine,
		"voted": voted,
		"performance": _perf_scores(user),
		"signature": signature,
		"achievement": achievement,
		"can_edit_mine": session == user or _is_admin(),
	}


@frappe.whitelist()
def set_my_superpowers(user, superpowers):
	"""The user themselves or an admin. Replace the user's self-claimed set with the
	distinct, valid, enabled catalog names given (blanks/dupes/unknown dropped)."""
	session = frappe.session.user
	if not (session == user or _is_admin()):
		frappe.throw("Not permitted", frappe.PermissionError)
	names = frappe.parse_json(superpowers) if isinstance(superpowers, str) else superpowers
	# Only Voted-kind traits are self-claimable (Performance ones are earned).
	# Treat a null/empty kind as Voted for rows created before the field existed.
	valid = {
		r["name"]
		for r in frappe.get_all("Superpower", filters={"enabled": 1}, fields=["name", "kind"])
		if (r["kind"] or "Voted") != "Performance"
	}
	clean, seen = [], set()
	for n in (names or []):
		n = n.strip() if isinstance(n, str) else n
		if n and n in valid and n not in seen:
			seen.add(n)
			clean.append(n)
	frappe.db.delete("User Superpower", {"user": user})
	for n in clean:
		frappe.get_doc({"doctype": "User Superpower", "user": user, "superpower": n}).insert(ignore_permissions=True)
	frappe.db.commit()
	return _mine_for(user)


# --- voting --------------------------------------------------------------------


@frappe.whitelist()
def cast_vote(ratee, superpower, score):
	"""Any logged-in user (not the ratee). Upsert the caller's 0-10 vote, mint
	recognition points, and return the trait's updated aggregate."""
	_require_login()
	voter = frappe.session.user
	if ratee == voter:
		frappe.throw("You cannot vote on yourself.")
	score = cint(score)
	if score < 0 or score > 10:
		frappe.throw("Score must be between 0 and 10.")
	if not frappe.db.exists("Superpower", superpower):
		frappe.throw("Unknown superpower.", frappe.DoesNotExistError)
	if frappe.db.get_value("Superpower", superpower, "kind") == "Performance":
		frappe.throw("This superpower is earned by performance and cannot be voted.")
	existing = frappe.db.exists(
		"Superpower Vote", {"ratee": ratee, "voter": voter, "superpower": superpower}
	)
	if existing:
		frappe.db.set_value("Superpower Vote", existing, "score", score)
	else:
		frappe.get_doc({
			"doctype": "Superpower Vote",
			"ratee": ratee,
			"voter": voter,
			"superpower": superpower,
			"score": score,
		}).insert(ignore_permissions=True)
	_recognition_credit(voter, ratee, superpower)
	frappe.db.commit()
	return _agg_one(ratee, superpower, voter)


@frappe.whitelist()
def remove_vote(ratee, superpower):
	"""The voter deletes their own vote for that (ratee, superpower)."""
	_require_login()
	voter = frappe.session.user
	existing = frappe.db.exists(
		"Superpower Vote", {"ratee": ratee, "voter": voter, "superpower": superpower}
	)
	if existing:
		frappe.delete_doc("Superpower Vote", existing, ignore_permissions=True)
		frappe.db.commit()
	return {"superpower": superpower}


# --- settings ------------------------------------------------------------------


@frappe.whitelist()
def get_superpower_settings():
	"""Any logged-in user. The tuning knobs + level bands."""
	_require_login()
	s = _settings()
	return {
		"prior_mean": flt(s.prior_mean),
		"confidence_k": cint(s.confidence_k),
		"vote_points": cint(s.vote_points),
		"perf_window_days": cint(s.perf_window_days) or 30,
		"streak_target": cint(s.streak_target) or 30,
		"finisher_target": cint(s.finisher_target) or 30,
		"levels": _levels(),
	}


@frappe.whitelist()
def save_superpower_settings(prior_mean=None, confidence_k=None, vote_points=None, perf_window_days=None, streak_target=None, finisher_target=None, levels=None):
	"""Admin only. Update the knobs and replace the level bands."""
	if not _is_admin():
		frappe.throw("Not permitted", frappe.PermissionError)
	s = frappe.get_single("Superpower Settings")
	if prior_mean is not None:
		s.prior_mean = flt(prior_mean)
	if confidence_k is not None:
		s.confidence_k = cint(confidence_k)
	if vote_points is not None:
		s.vote_points = cint(vote_points)
	if perf_window_days is not None:
		s.perf_window_days = cint(perf_window_days)
	if streak_target is not None:
		s.streak_target = cint(streak_target)
	if finisher_target is not None:
		s.finisher_target = cint(finisher_target)
	if levels is not None:
		rows = frappe.parse_json(levels) if isinstance(levels, str) else levels
		s.set("levels", [])
		for r in (rows or []):
			s.append("levels", {
				"level_name": r.get("level_name"),
				"min_score": flt(r.get("min_score")),
				"color": r.get("color"),
				"icon": r.get("icon"),
			})
	s.save(ignore_permissions=True)
	frappe.db.commit()
	return get_superpower_settings()
