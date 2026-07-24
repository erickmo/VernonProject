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
from frappe.utils import cint, flt, now_datetime, add_days, get_time, getdate, nowdate
# The gamified DiceBear avatar (config) wins over the uploaded photo everywhere
# in the app — reuse mobile's batch resolver so superpower avatars match.
from vernon_project.api.mobile import _avatar_config_map, _notify

# Mirrors mobile.py STATUS_COMPLETED (the completed Project Todo status).
_STATUS_COMPLETED = "✅ Completed"
_ATT_ONTIME = ("Present", "EarlyLeave")   # arrived on time
_ATT_LATE = ("Late", "Late+EarlyLeave")   # arrived late
_ATT_ACTIVE = _ATT_ONTIME + _ATT_LATE     # counts as an active/attended day


# --- helpers -------------------------------------------------------------------


def _is_admin():
	return "System Manager" in frappe.get_roles()


def _is_hr():
	"""HR Manager or System Manager — the roles allowed to see others' private
	peer-vote scores (a person's received scores are otherwise owner-only)."""
	roles = frappe.get_roles()
	return "HR Manager" in roles or "System Manager" in roles


# Peer-voted averages below this stay private and off the team wall. Votes are
# anonymous and exist to help each person know & grow their own strengths, so
# only strong signals (and only to the owner / HR) are surfaced elsewhere.
# The threshold is admin-tunable via Superpower Settings.wall_score_min.
_WALL_SCORE_MIN_DEFAULT = 7.5


def _wall_min():
	return flt(_settings().wall_score_min) or _WALL_SCORE_MIN_DEFAULT


def _quarter_key(d=None):
	"""Voting quarter tag like '2026-Q3'. Peer votes expire each quarter — a fresh
	row per (ratee, voter, superpower, quarter) is kept so history powers the ratee's
	progress trend, while aggregates and the gate scope to the current quarter."""
	d = getdate(d) if d else getdate(nowdate())
	return f"{d.year}-Q{(d.month - 1) // 3 + 1}"


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
		"description": meta.get("description"),
		"avg": round(S / n, 4) if n else 0,
		"count": n,
		"weighted": round(W, 4),
		"level": {"level_name": level["level_name"], "color": level["color"], "icon": level["icon"]} if level else None,
		"my_vote": my_vote,
	}


def _voted_for(ratee, caller):
	"""Aggregate this quarter's Superpower Votes for `ratee`, grouped by superpower.
	Votes expire quarterly, so only the current quarter counts toward live scores."""
	votes = frappe.get_all(
		"Superpower Vote",
		filters={"ratee": ratee, "quarter": _quarter_key()},
		fields=["superpower", "voter", "score"],
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
			"description": meta.get("description"),
		})
	return out


def _recognition_credit(voter, ratee, superpower):
	"""Mint vote_points to the ratee as a Recognition Point Ledger row. Idempotent
	per (voter, ratee, superpower, quarter) via the note key, so re-voting within a
	quarter never farms extra points but a new quarter's recognition mints again.
	Inert when vote_points<=0. Mirrors mobile.py::_recognition_credit."""
	pts = cint(_settings().vote_points)
	if pts <= 0:
		return
	note = f"Superpower: {superpower} · {_quarter_key()}"
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
		fields=["name", "superpower_name", "metric", "icon", "color", "category", "description"],
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
			"description": r["description"],
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
	# A person's received peer-vote scores are private: only the owner (to know &
	# grow themselves) or HR/System Manager may see the aggregates, signature and
	# achievement. Any other viewer gets only their OWN cast vote per trait (so they
	# can still see/change what they gave) — no averages, counts or levels leak.
	can_see_scores = (session == user) or _is_hr()
	voted = _voted_for(user, session)
	if can_see_scores:
		signature = max(voted, key=lambda x: x["weighted"]) if voted else None
		levels = _levels()
		top_name = levels[-1]["level_name"] if levels else None
		achievement = any(it["level"] and it["level"]["level_name"] == top_name for it in voted)
	else:
		voted = [
			{**it, "avg": 0, "count": 0, "weighted": 0, "level": None}
			for it in voted
			if it["my_vote"] is not None
		]
		signature = None
		achievement = False
	meta = frappe.db.get_value("User", user, ["full_name", "user_image"], as_dict=True) or {}
	return {
		"user": user,
		"user_name": meta.get("full_name") or user,
		"user_image": meta.get("user_image"),
		"avatar_config": _avatar_config_map([user]).get(user),
		"mine": mine,
		"voted": voted,
		"performance": _perf_scores(user),
		"signature": signature,
		"achievement": achievement,
		"can_see_scores": can_see_scores,
		# Only the owner may edit their own self-claimed superpowers (not admins).
		"can_edit_mine": session == user,
	}


def _perf_wall_groups():
	"""Performance superpowers as wall groups: each enabled Performance trait, with
	members = users who earned score>0, ranked by score. Batched — 2 queries for all
	users instead of _perf_scores' O(users) round-trips (85 users ≈ 8s otherwise).
	Same scoring formulas as the per-user _score_* helpers, computed from in-memory
	aggregates. Returns raw groups {superpower, kind, members:[{user,score,...}]}."""
	perf = frappe.get_all(
		"Superpower", filters={"enabled": 1, "kind": "Performance"}, fields=["name", "metric"]
	)
	if not perf:
		return []
	s = _settings()
	window = cint(s.perf_window_days) or 30
	streak_target = cint(s.streak_target) or 30
	finisher_target = cint(s.finisher_target) or 30
	# Streak needs target+2 days of history; fetch the longer of the two windows.
	start = add_days(nowdate(), -max(window, streak_target + 2))
	window_start = getdate(add_days(nowdate(), -window))
	today = getdate(nowdate())
	att = {}   # user -> [(date, status)]
	for r in frappe.get_all(
		"Daily Attendance",
		filters={"attendance_date": [">=", start], "status": ["in", list(_ATT_ACTIVE)]},
		fields=["employee", "status", "attendance_date"],
	):
		att.setdefault(r["employee"], []).append((getdate(r["attendance_date"]), r["status"]))
	todo = {}  # user -> [(date, deadline)]
	for r in frappe.get_all(
		"Project Todo",
		filters={"status": _STATUS_COMPLETED, "completed_at": [">=", start]},
		fields=["assigned_to", "completed_at", "deadline"],
	):
		todo.setdefault(r["assigned_to"], []).append((getdate(r["completed_at"]), r.get("deadline")))
	users = set(att) | set(todo)

	def ontime(u):
		rows = [st for (d, st) in att.get(u, []) if d >= window_start]
		return (sum(1 for st in rows if st in _ATT_ONTIME) / len(rows) * 10) if rows else 0

	def beat(u):
		rows = [(d, dl) for (d, dl) in todo.get(u, []) if d >= window_start]
		return (sum(1 for (d, dl) in rows if dl and d <= getdate(dl)) / len(rows) * 10) if rows else 0

	def finisher(u):
		cnt = sum(1 for (d, _) in todo.get(u, []) if d >= window_start)
		return min(cnt, finisher_target) / finisher_target * 10 if finisher_target else 0

	def streak(u):
		active = {d for (d, _) in att.get(u, [])} | {d for (d, _) in todo.get(u, [])}
		cur = today if today in active else (add_days(today, -1) if getdate(add_days(today, -1)) in active else None)
		run, d = 0, (getdate(cur) if cur else None)
		while d and d in active:
			run += 1
			d = getdate(add_days(d, -1))
		return min(run, streak_target) / streak_target * 10 if streak_target else 0

	fns = {"ontime": ontime, "beat_deadline": beat, "finisher": finisher, "streak": streak}
	out = []
	for t in perf:
		f = fns.get(t["metric"])
		if not f:
			continue
		members = [
			{"user": u, "score": round(sc, 1), "vote_count": 0, "self_claimed": False}
			for u in users
			for sc in [f(u)]
			if sc > 0
		]
		if members:
			out.append({"superpower": t["name"], "kind": "Performance", "members": members})
	return out


@frappe.whitelist()
def get_superpower_wall():
	"""Team-wall grouping in two families the UI shows as separate tabs.
	Scored (kind Voted / Performance): Voted groups list only members whose average
	peer vote is > 7.5 — votes are anonymous and low scores stay private, so the wall
	celebrates strengths only. Performance groups list users with an earned score>0
	(objective, unfiltered). Self-claimed (kind SelfClaimed): everyone who self-claimed
	the trait, no scores, fully public. Members sort by score desc (tiebreak vote
	count, name); groups by member count desc, then name. Disabled users dropped."""
	_require_login()
	wall_min = _wall_min()
	# --- peer-voted averages (this quarter), kept only above the threshold (private-strengths) ---
	vagg = {}  # (superpower, user) -> {sum, count}
	for v in frappe.get_all(
		"Superpower Vote", filters={"quarter": _quarter_key()}, fields=["superpower", "ratee", "score"]
	):
		a = vagg.setdefault((v["superpower"], v["ratee"]), {"sum": 0, "count": 0})
		a["sum"] += cint(v["score"])
		a["count"] += 1
	voted = {}  # superpower -> members
	for (sp, user), a in vagg.items():
		avg = a["sum"] / a["count"]
		if avg > wall_min:
			voted.setdefault(sp, []).append(
				{"user": user, "score": round(avg, 1), "vote_count": a["count"], "self_claimed": False}
			)
	# --- self-claimed: public. Show the member's peer-vote score only when it clears
	# the same threshold (else no score badge), so strong self-claims are validated. ---
	claimed = {}  # superpower -> members
	for r in frappe.get_all("User Superpower", fields=["superpower", "user"]):
		a = vagg.get((r["superpower"], r["user"]))
		avg = (a["sum"] / a["count"]) if a else 0
		show = avg > wall_min
		claimed.setdefault(r["superpower"], []).append({
			"user": r["user"],
			"score": round(avg, 1) if show else 0,
			"vote_count": a["count"] if (a and show) else 0,
			"self_claimed": True,
		})
	raw_groups = (
		[{"superpower": sp, "kind": "Voted", "members": m} for sp, m in voted.items()]
		+ _perf_wall_groups()
		+ [{"superpower": sp, "kind": "SelfClaimed", "members": m} for sp, m in claimed.items()]
	)
	if not raw_groups:
		return {"groups": []}
	all_users = {m["user"] for g in raw_groups for m in g["members"]}
	meta = {
		m["name"]: m
		for m in frappe.get_all(
			"User",
			filters={"name": ["in", list(all_users)], "enabled": 1},
			fields=["name", "full_name", "user_image"],
		)
	}
	avatars = _avatar_config_map(list(meta))
	catalog = _catalog_map([g["superpower"] for g in raw_groups])
	groups = []
	for g in raw_groups:
		users = []
		for m in g["members"]:
			um = meta.get(m["user"])
			if not um:
				continue
			users.append({
				"name": m["user"],
				"full_name": um["full_name"] or m["user"],
				"user_image": um["user_image"],
				"avatar_config": avatars.get(m["user"]),
				"score": m["score"],
				"vote_count": m["vote_count"],
				"self_claimed": m["self_claimed"],
			})
		if not users:
			continue
		users.sort(key=lambda x: (-x["score"], -x["vote_count"], (x["full_name"] or "").lower()))
		cm = catalog.get(g["superpower"]) or {}
		groups.append({
			"superpower": g["superpower"],
			"name": cm.get("superpower_name") or g["superpower"],
			"icon": cm.get("icon"),
			"color": cm.get("color"),
			"category": cm.get("category"),
			"kind": g["kind"],
			"count": len(users),
			"users": users,
		})
	groups.sort(key=lambda g: (-g["count"], g["name"].lower()))
	return {"groups": groups}


@frappe.whitelist()
def get_superpower_progress(user):
	"""Per-quarter recognition trend for `user` (the ratee) — owner or HR only, since
	scores are private. Peer votes expire each quarter, so this is how the voted user
	watches their progress build: each quarter's overall average received vote (0-10),
	distinct superpowers scored, and distinct voters. Oldest → newest."""
	_require_login()
	session = frappe.session.user
	if not (session == user or _is_hr()):
		frappe.throw("Not permitted", frappe.PermissionError)
	by_q = {}
	for r in frappe.get_all(
		"Superpower Vote", filters={"ratee": user}, fields=["quarter", "superpower", "voter", "score"]
	):
		q = r["quarter"]
		if not q:
			continue
		a = by_q.setdefault(q, {"sum": 0, "n": 0, "traits": set(), "voters": set()})
		a["sum"] += cint(r["score"])
		a["n"] += 1
		a["traits"].add(r["superpower"])
		a["voters"].add(r["voter"])
	quarters = sorted(
		(
			{
				"quarter": q,
				"avg": round(a["sum"] / a["n"], 2) if a["n"] else 0,
				"traits": len(a["traits"]),
				"voters": len(a["voters"]),
			}
			for q, a in by_q.items()
		),
		key=lambda x: x["quarter"],
	)
	return {"quarters": quarters, "current": _quarter_key()}


@frappe.whitelist()
def set_my_superpowers(user, superpowers):
	"""Only the user themselves. Replace the user's self-claimed set with the
	distinct, valid, enabled catalog names given (blanks/dupes/unknown dropped).
	Self-claimed superpowers are owner-only — not even admins may set them."""
	session = frappe.session.user
	if session != user:
		frappe.throw("You can only edit your own superpowers.", frappe.PermissionError)
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
	# Upsert within the current quarter — a new quarter starts a fresh row so past
	# quarters stay intact for the ratee's progress trend.
	q = _quarter_key()
	existing = frappe.db.exists(
		"Superpower Vote", {"ratee": ratee, "voter": voter, "superpower": superpower, "quarter": q}
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
			"quarter": q,
		}).insert(ignore_permissions=True)
	_recognition_credit(voter, ratee, superpower)
	frappe.db.commit()
	# Anonymous & one-directional: the voter never sees the ratee's aggregate back
	# (it's private). Echo only their own vote so the UI can reflect it.
	return {"superpower": superpower, "my_vote": score}


@frappe.whitelist()
def list_votable_users():
	"""Any logged-in user. All active users to rate (excluding self), each flagged
	with whether the caller has already voted them — the 'voted' marker + count."""
	session = frappe.session.user
	if session == "Guest":
		frappe.throw("Login required.", frappe.PermissionError)
	users = frappe.get_all(
		"User",
		filters={"enabled": 1, "name": ["not in", ["Guest", "Administrator", session]]},
		fields=["name", "full_name", "user_image"],
		order_by="full_name asc",
	)
	# Current quarter only — the "sudah dinilai" marker resets when votes expire.
	counts = {}
	for r in frappe.get_all(
		"Superpower Vote", filters={"voter": session, "quarter": _quarter_key()}, fields=["ratee"]
	):
		counts[r["ratee"]] = counts.get(r["ratee"], 0) + 1
	avatars = _avatar_config_map([u["name"] for u in users])
	return [{
		"user": u["name"],
		"user_name": u["full_name"] or u["name"],
		"user_image": u["user_image"],
		"avatar_config": avatars.get(u["name"]),
		"voted": u["name"] in counts,
		"vote_count": counts.get(u["name"], 0),
	} for u in users]


@frappe.whitelist()
def remove_vote(ratee, superpower):
	"""The voter deletes their own current-quarter vote for that (ratee, superpower)."""
	_require_login()
	voter = frappe.session.user
	existing = frappe.db.exists(
		"Superpower Vote",
		{"ratee": ratee, "voter": voter, "superpower": superpower, "quarter": _quarter_key()},
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
		"wall_score_min": _wall_min(),
		"perf_window_days": cint(s.perf_window_days) or 30,
		"streak_target": cint(s.streak_target) or 30,
		"finisher_target": cint(s.finisher_target) or 30,
		"levels": _levels(),
	}


@frappe.whitelist()
def save_superpower_settings(prior_mean=None, confidence_k=None, vote_points=None, wall_score_min=None, perf_window_days=None, streak_target=None, finisher_target=None, levels=None):
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
	if wall_score_min is not None:
		s.wall_score_min = flt(wall_score_min)
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


# --- daily recognition gate ----------------------------------------------------
# Force each Internal-Team member to cast one superpower vote per day for an
# Internal-Team colleague they haven't voted yet, until all colleagues are voted.
# Blocking gate on app open + a daily push. State derives entirely from Superpower
# Vote rows — no new doctype. Gated by Vernon Settings.force_daily_recognition.
# See docs/superpowers/specs/2026-07-22-daily-recognition-gate-design.md.

_INTERNAL_TEAM = "Internal Team"


def _recognition_enabled():
	return bool(cint(frappe.db.get_single_value("Vernon Settings", "force_daily_recognition")))


def _recognition_gate_open():
	"""True if the current server time is at/after the configured gate start time.
	Empty/unset start time means the gate may pop any time of day."""
	start = frappe.db.get_single_value("Vernon Settings", "recognition_gate_start_time")
	if not start:
		return True
	return now_datetime().time() >= get_time(start)


def _has_votable_catalog():
	"""True if any enabled, non-Performance (votable) superpower exists. Null kind
	is treated as Voted, matching set_my_superpowers."""
	rows = frappe.get_all("Superpower", filters={"enabled": 1}, fields=["name", "kind"])
	return any((r["kind"] or "Voted") != "Performance" for r in rows)


def _internal_colleagues(user):
	"""Enabled Internal-Team users other than `user`."""
	return frappe.get_all(
		"User",
		filters={"enabled": 1, "custom_member_type": _INTERNAL_TEAM, "name": ["!=", user]},
		fields=["name", "full_name", "user_image"],
		order_by="full_name asc",
	)


def _votable_names():
	"""Enabled, votable (non-Performance) superpower names — the full set a colleague
	must be scored on to count as recognized. Null kind is treated as Voted."""
	return {
		r["name"]
		for r in frappe.get_all("Superpower", filters={"enabled": 1}, fields=["name", "kind"])
		if (r["kind"] or "Voted") != "Performance"
	}


def _done_and_progress(user, colleagues):
	"""(done, progress) for this quarter. progress[colleague] = # distinct votable
	superpowers `user` scored them on this quarter; done = colleagues scored on EVERY
	votable superpower (none left out). Recognition is complete only when whole."""
	names = [c["name"] for c in colleagues]
	votable = _votable_names()
	need = len(votable)
	progress = {}
	if names and votable:
		for v in frappe.get_all(
			"Superpower Vote",
			filters={
				"voter": user,
				"ratee": ["in", names],
				"quarter": _quarter_key(),
				"superpower": ["in", list(votable)],
			},
			fields=["ratee", "superpower"],
		):
			progress.setdefault(v["ratee"], set()).add(v["superpower"])
	done = {r for r, sp in progress.items() if len(sp) >= need} if need else set()
	return done, {r: len(sp) for r, sp in progress.items()}


def _completed_today(user, done):
	"""True if `user` finished a colleague (all superpowers) today — a fully-done
	colleague with a vote created today. Enforces one full recognition per day."""
	if not done:
		return False
	return bool(
		frappe.db.exists(
			"Superpower Vote",
			{
				"voter": user,
				"ratee": ["in", list(done)],
				"quarter": _quarter_key(),
				"creation": [">=", getdate(nowdate())],
			},
		)
	)


def _assign(undone, progress):
	"""Pick the next colleague to recognize: finish ones already started this quarter
	first (progress desc), then spread to those with the fewest current-quarter votes
	received, tiebreak name — so nobody is abandoned half-scored or piled on."""
	names = [c["name"] for c in undone]
	recv = {}
	for v in frappe.get_all(
		"Superpower Vote", filters={"ratee": ["in", names], "quarter": _quarter_key()}, fields=["ratee"]
	):
		recv[v["ratee"]] = recv.get(v["ratee"], 0) + 1
	return min(
		undone,
		key=lambda c: (-progress.get(c["name"], 0), recv.get(c["name"], 0), (c["full_name"] or c["name"]).lower()),
	)


def _gate_off(remaining=0, total=0):
	return {"owed": False, "assignee": None, "remaining": remaining, "total": total}


@frappe.whitelist()
def get_recognition_gate(preview=0):
	"""The session user's daily recognition obligation. `owed` is True only when the
	feature is on, the user is Internal Team, a votable catalog exists, they still
	have un-voted Internal-Team colleagues, and they haven't voted a new colleague
	today. `assignee` is who to recognize now.

	`preview=1` (System Manager only) is a testing override: it ignores the settings
	flag, the Internal-Team membership check, and the once-per-day check, so an admin
	can always see a populated gate. It still casts real votes if submitted."""
	_require_login()
	user = frappe.session.user
	preview = bool(cint(preview)) and _is_admin()
	if not _has_votable_catalog():
		return _gate_off()
	if not preview:
		if not _recognition_enabled() or not _recognition_gate_open():
			return _gate_off()
		if (frappe.db.get_value("User", user, "custom_member_type") or "") != _INTERNAL_TEAM:
			return _gate_off()
	colleagues = _internal_colleagues(user)
	total = len(colleagues)
	if not total:
		return _gate_off()
	done, progress = _done_and_progress(user, colleagues)
	undone = [c for c in colleagues if c["name"] not in done]
	remaining = len(undone)
	if not preview and (not remaining or _completed_today(user, done)):
		return _gate_off(remaining, total)
	# preview always shows someone: fall back to the full colleague list if all done.
	a = _assign(undone if undone else colleagues, progress)
	return {
		"owed": True,
		"assignee": {
			"user": a["name"],
			"user_name": a["full_name"] or a["name"],
			"user_image": a["user_image"],
			"avatar_config": _avatar_config_map([a["name"]]).get(a["name"]),
		},
		"remaining": remaining,
		"total": total,
	}


def notify_recognition_gate():
	"""Daily scheduler: push each owing Internal-Team member a reminder to recognize
	their assigned colleague. Runs in the morning, before anyone has voted today, so
	it only checks that un-voted colleagues remain."""
	if not _recognition_enabled() or not _has_votable_catalog():
		return
	for m in frappe.get_all(
		"User", filters={"enabled": 1, "custom_member_type": _INTERNAL_TEAM}, fields=["name"]
	):
		user = m["name"]
		colleagues = _internal_colleagues(user)
		done, progress = _done_and_progress(user, colleagues)
		undone = [c for c in colleagues if c["name"] not in done]
		if not undone:
			continue
		a = _assign(undone, progress)
		name = a["full_name"] or a["name"]
		_notify(
			user,
			"Kudos",
			"Kenali rekanmu hari ini ⚡",
			f"Nilai semua superpower {name}. {len(undone)} rekan lagi menunggu pengakuanmu kuartal ini.",
		)
