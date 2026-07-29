# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

"""Personal habit tracker: per-user habits, streaks (no gamification),
DISC-personalized suggestions, and an admin-gated daily reminder.

Streak/schedule/suggestion logic is server-side so both frontends are identical.
`_streak`/`_scheduled` are pure (no frappe) and self-checked in __main__.
"""

import datetime
import json

import frappe


def _scheduled(d, cadence, weekdays):
	"""Is habit scheduled on date d? weekdays = set of ints 0=Mon..6=Sun."""
	if cadence == "Daily":
		return True
	return d.weekday() in weekdays


def _streak(log_dates, cadence, weekdays, today):
	"""(current_streak, best_streak) over SCHEDULED days only.

	log_dates: set of 'YYYY-MM-DD' strings with a check-in.
	current: walk back from today over scheduled days; an unchecked *today*
	does not break the run (start from yesterday if today unchecked), stop at
	the first scheduled day with no log.
	best: longest consecutive run of scheduled days that are all logged.
	"""
	def done(d):
		return d.isoformat() in log_dates

	# ---- current streak ----
	# Walk back over scheduled days; terminate at the earliest logged day — no
	# streak can extend before the first check-in, which also bounds the loop.
	current = 0
	if log_dates:
		earliest = min(datetime.date.fromisoformat(x) for x in log_dates)
		d = today
		if _scheduled(d, cadence, weekdays) and not done(d):
			d = d - datetime.timedelta(days=1)  # today unchecked → don't penalize yet
		while d >= earliest:
			if _scheduled(d, cadence, weekdays):
				if done(d):
					current += 1
				else:
					break
			d = d - datetime.timedelta(days=1)

	# ---- best streak ----
	best = run = 0
	if log_dates:
		start = min(datetime.date.fromisoformat(x) for x in log_dates)
		d = start
		while d <= today:
			if _scheduled(d, cadence, weekdays):
				if done(d):
					run += 1
					best = max(best, run)
				else:
					run = 0
			d = d + datetime.timedelta(days=1)
	return current, best


def demo():
	D = datetime.date
	# daily unbroken run of 3 ending today
	assert _streak({"2026-07-27", "2026-07-28", "2026-07-29"}, "Daily", set(), D(2026, 7, 29)) == (3, 3)
	# daily, today unchecked but yesterday+before done → current 2, best 2
	assert _streak({"2026-07-27", "2026-07-28"}, "Daily", set(), D(2026, 7, 29)) == (2, 2)
	# daily with a gap: 27 done, 28 missing, 29 done → current 1 (only today), best 1
	assert _streak({"2026-07-27", "2026-07-29"}, "Daily", set(), D(2026, 7, 29)) == (1, 1)
	# weekdays Mon/Wed/Fri (0,2,4): Mon 27 + Wed 29 done, skips Tue → current 2
	assert _streak({"2026-07-27", "2026-07-29"}, "Weekdays", {0, 2, 4}, D(2026, 7, 29)) == (2, 2)
	# empty logs
	assert _streak(set(), "Daily", set(), D(2026, 7, 29)) == (0, 0)
	# best > current: long run then gap then short: 20,21,22 (run3) gap 23 then 29 today
	assert _streak({"2026-07-20", "2026-07-21", "2026-07-22", "2026-07-29"}, "Daily", set(), D(2026, 7, 29)) == (1, 3)
	# streak longer than the old 366-day cap must be exact (regression guard)
	long_dates = {(D(2026, 7, 29) - datetime.timedelta(days=i)).isoformat() for i in range(400)}
	assert _streak(long_dates, "Daily", set(), D(2026, 7, 29)) == (400, 400)
	# _parse_weekdays accepts CSV, JSON-array string, and list; drops junk tokens
	assert _parse_weekdays("0,2,4") == [0, 2, 4]
	assert _parse_weekdays("[0,2,4]") == [0, 2, 4]
	assert _parse_weekdays([0, 2, 4]) == [0, 2, 4]
	assert _parse_weekdays("") == []
	assert _parse_weekdays("9,x,3") == [3]
	print("habit _streak self-check OK")


# Suggestions keyed by DISC axis. Titles in Bahasa (end-user voice).
# key = stable slug for adopt_suggestion lookup.
_SUGGESTIONS = {
	"D": [
		{"key": "d-top3", "title": "Tentukan 3 prioritas utama pagi ini", "icon": "🎯", "cadence": "Daily", "weekdays": []},
		{"key": "d-hardest", "title": "Kerjakan tugas tersulit lebih dulu", "icon": "⛰️", "cadence": "Daily", "weekdays": []},
		{"key": "d-workout", "title": "Olahraga / tantangan fisik", "icon": "💪", "cadence": "Daily", "weekdays": []},
		{"key": "d-goal", "title": "Tinjau target mingguan", "icon": "🏁", "cadence": "Weekdays", "weekdays": [0]},
	],
	"I": [
		{"key": "i-thanks", "title": "Kirim ucapan terima kasih ke rekan", "icon": "💬", "cadence": "Daily", "weekdays": []},
		{"key": "i-win", "title": "Bagikan satu pencapaian hari ini", "icon": "🎉", "cadence": "Daily", "weekdays": []},
		{"key": "i-reach", "title": "Sapa seseorang yang baru", "icon": "🤝", "cadence": "Weekdays", "weekdays": [0, 1, 2, 3, 4]},
		{"key": "i-gratitude", "title": "Tulis satu catatan syukur", "icon": "🙏", "cadence": "Daily", "weekdays": []},
	],
	"S": [
		{"key": "s-sleep", "title": "Tidur & bangun di jam yang sama", "icon": "😴", "cadence": "Daily", "weekdays": []},
		{"key": "s-walk", "title": "Jalan kaki harian", "icon": "🚶", "cadence": "Daily", "weekdays": []},
		{"key": "s-water", "title": "Minum air yang cukup", "icon": "💧", "cadence": "Daily", "weekdays": []},
		{"key": "s-tidy", "title": "Rapikan meja kerja di akhir hari", "icon": "🧹", "cadence": "Weekdays", "weekdays": [0, 1, 2, 3, 4]},
	],
	"C": [
		{"key": "c-plan", "title": "Rencanakan besok malam ini", "icon": "🗒️", "cadence": "Daily", "weekdays": []},
		{"key": "c-reflect", "title": "Refleksi / jurnal 5 menit", "icon": "📓", "cadence": "Daily", "weekdays": []},
		{"key": "c-read", "title": "Baca atau belajar 20 menit", "icon": "📚", "cadence": "Daily", "weekdays": []},
		{"key": "c-inbox", "title": "Bersihkan inbox sampai nol", "icon": "📥", "cadence": "Weekdays", "weekdays": [0, 1, 2, 3, 4]},
	],
	"_": [  # generic fallback when no DISC
		{"key": "g-water", "title": "Minum air yang cukup", "icon": "💧", "cadence": "Daily", "weekdays": []},
		{"key": "g-read", "title": "Baca 20 menit", "icon": "📚", "cadence": "Daily", "weekdays": []},
		{"key": "g-move", "title": "Bergerak / olahraga", "icon": "🏃", "cadence": "Daily", "weekdays": []},
		{"key": "g-plan", "title": "Rencanakan hari ini", "icon": "🗒️", "cadence": "Daily", "weekdays": []},
		{"key": "g-sleep", "title": "Tidur tepat waktu", "icon": "😴", "cadence": "Daily", "weekdays": []},
	],
}


def _require_user():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	return user


def _parse_weekdays(csv):
	"""CSV string, JSON-array string, or list -> sorted list of ints 0..6."""
	if not csv:
		return []
	if isinstance(csv, str):
		s = csv.strip()
		if s.startswith("["):
			try:
				csv = json.loads(s)
			except (ValueError, TypeError):
				csv = s
	if isinstance(csv, str):
		parts = [p.strip() for p in csv.split(",") if p.strip() != ""]
	else:
		parts = csv
	out = []
	for p in parts:
		try:
			n = int(p)
		except (ValueError, TypeError):
			continue
		if 0 <= n <= 6:
			out.append(n)
	return sorted(set(out))


def _disc_type(user):
	"""Caller's dominant DISC axis string (e.g. 'D', 'DI'), or '' if untaken."""
	from vernon_project.vernon_project.doctype.employee_profile.employee_profile import _ensure_employee_profile
	try:
		doc = _ensure_employee_profile(user)
		return doc.disc_type or ""
	except Exception:
		return ""


def _suggestions_for(existing_titles, disc):
	axes = [a for a in ("D", "I", "S", "C") if a in disc]
	picked = []
	seen = set()
	for axis in axes:
		for s in _SUGGESTIONS.get(axis, []):
			if s["title"] in existing_titles or s["title"] in seen:
				continue
			seen.add(s["title"])
			picked.append(dict(s, disc_axis=axis))
	if not picked:  # no DISC or all adopted → generic
		for s in _SUGGESTIONS["_"]:
			if s["title"] in existing_titles or s["title"] in seen:
				continue
			seen.add(s["title"])
			picked.append(dict(s, disc_axis=""))
	return picked


@frappe.whitelist()
def get_habits():
	user = _require_user()
	today = frappe.utils.getdate(frappe.utils.today())
	rows = frappe.get_all(
		"Habit",
		filters={"user": user, "active": 1},
		fields=["name", "title", "icon", "cadence", "weekdays"],
		order_by="creation asc",
		limit_page_length=0,
	)
	# all logs for this user in one query, grouped by habit
	logs = frappe.get_all(
		"Habit Log", filters={"user": user}, fields=["habit", "date"], limit_page_length=0
	)
	by_habit = {}
	for lg in logs:
		by_habit.setdefault(lg.habit, set()).add(frappe.utils.getdate(lg.date).isoformat())

	habits = []
	for r in rows:
		wd = set(_parse_weekdays(r.weekdays))
		dates = by_habit.get(r.name, set())
		cur, best = _streak(dates, r.cadence, wd, today)
		week = []
		for i in range(6, -1, -1):
			d = today - datetime.timedelta(days=i)
			week.append({
				"date": d.isoformat(),
				"scheduled": _scheduled(d, r.cadence, wd),
				"done": d.isoformat() in dates,
			})
		habits.append({
			"name": r.name,
			"title": r.title,
			"icon": r.icon or "",
			"cadence": r.cadence,
			"weekdays": sorted(wd),
			"active": 1,
			"scheduled_today": _scheduled(today, r.cadence, wd),
			"done_today": today.isoformat() in dates,
			"current_streak": cur,
			"best_streak": best,
			"week": week,
		})

	existing_titles = {h["title"] for h in habits}
	disc = _disc_type(user)
	return {
		"habits": habits,
		"suggestions": _suggestions_for(existing_titles, disc),
		"disc_type": disc,
	}


@frappe.whitelist()
def create_habit(title, icon=None, cadence="Daily", weekdays=None, disc_axis=None):
	user = _require_user()
	title = (title or "").strip()
	if not title:
		frappe.throw("Title required")
	if cadence not in ("Daily", "Weekdays"):
		cadence = "Daily"
	wd = _parse_weekdays(weekdays)
	doc = frappe.get_doc({
		"doctype": "Habit", "user": user, "title": title, "icon": icon or "",
		"cadence": cadence, "weekdays": ",".join(str(n) for n in wd),
		"active": 1, "disc_axis": disc_axis or "",
	}).insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": doc.name}


def _owned(habit, user):
	row = frappe.db.get_value("Habit", habit, ["name", "user"], as_dict=True)
	if not row or row.user != user:
		frappe.throw("Not permitted", frappe.PermissionError)
	return row.name


@frappe.whitelist()
def update_habit(habit, title=None, icon=None, cadence=None, weekdays=None):
	user = _require_user()
	name = _owned(habit, user)
	doc = frappe.get_doc("Habit", name)
	if title is not None:
		t = title.strip()
		if not t:
			frappe.throw("Title required")
		doc.title = t
	if icon is not None:
		doc.icon = icon
	if cadence in ("Daily", "Weekdays"):
		doc.cadence = cadence
	if weekdays is not None:
		doc.weekdays = ",".join(str(n) for n in _parse_weekdays(weekdays))
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1}


@frappe.whitelist()
def delete_habit(habit):
	user = _require_user()
	name = _owned(habit, user)
	frappe.db.set_value("Habit", name, "active", 0)
	frappe.db.commit()
	return {"ok": 1}


@frappe.whitelist()
def toggle_habit(habit, date=None):
	user = _require_user()
	name = _owned(habit, user)
	d = frappe.utils.getdate(date) if date else frappe.utils.getdate(frappe.utils.today())
	existing = frappe.db.get_value("Habit Log", {"habit": name, "date": d}, "name")
	if existing:
		frappe.delete_doc("Habit Log", existing, ignore_permissions=True)
	else:
		frappe.get_doc({"doctype": "Habit Log", "user": user, "habit": name, "date": d}).insert(ignore_permissions=True)
	frappe.db.commit()
	# recompute streak for this habit
	h = frappe.db.get_value("Habit", name, ["cadence", "weekdays"], as_dict=True)
	dates = {frappe.utils.getdate(x.date).isoformat() for x in frappe.get_all("Habit Log", filters={"habit": name}, fields=["date"], limit_page_length=0)}
	today = frappe.utils.getdate(frappe.utils.today())
	cur, best = _streak(dates, h.cadence, set(_parse_weekdays(h.weekdays)), today)
	return {"done_today": today.isoformat() in dates, "current_streak": cur, "best_streak": best}


@frappe.whitelist()
def adopt_suggestion(key):
	user = _require_user()
	for axis, items in _SUGGESTIONS.items():
		for s in items:
			if s["key"] == key:
				return create_habit(
					title=s["title"], icon=s["icon"], cadence=s["cadence"],
					weekdays=s["weekdays"], disc_axis="" if axis == "_" else axis,
				)
	frappe.throw("Unknown suggestion")


if __name__ == "__main__":
	demo()
