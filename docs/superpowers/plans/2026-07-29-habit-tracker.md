# Habit Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a personal, per-user habit tracker with DISC-personalized suggestions, streaks (no gamification), and an admin-gated daily reminder, to both the mobile (`/m`) and web (`/w`) frontends.

**Architecture:** Two new per-user doctypes (`Habit`, `Habit Log`) isolated like `personal_note`. All streak/schedule/suggestion logic lives server-side in a new `api/habit.py` (mirrors `api/focus.py`), so both frontends render identical data with zero client logic. A pure `_streak()` helper carries the only non-trivial logic and gets a plain-`python3` self-check. Frontend adds one shared data layer (`api.ts` + `useData.ts` + `types.ts`) consumed by one screen per platform.

**Tech Stack:** Frappe (Python doctypes + whitelisted API + scheduler), React + React Query + TypeScript (two Vite frontends), Tailwind.

## Global Constraints

- **No test DB — live site.** Real unit tests only for pure functions runnable with `python3 <file>` (no bench, no site). DB/API/frontend tasks verify via the real endpoint in `bench --site project.vernon.id console` and by grepping the built bundle. Source: project memory `vernon-live-site-codefirst`.
- **Both frontends, every UI change.** `frontend/` = mobile `/m` (Soft-Pop cards), `frontend-web/` = web `/w` (bento tiles). Shared logic in `frontend/src` imported as `@` from web; `@web` = `frontend-web/src`. A change is not done until it exists in both.
- **No native `alert/confirm/prompt`** — use an in-app `<dialog>`/modal. Source: memory `vernon-no-alert-use-dialog`.
- **Every dropdown uses `SearchableSelect`/`MultiSelectSearch`** — zero native `<select>`. Source: memory `vernon-searchable-select-convention`.
- **Streaks only — no Point Ledger.** Habit check-ins mint no points and touch no score/level/badge.
- **Weekday convention: `0`=Monday … `6`=Sunday** (Python `date.weekday()`), single source of truth for scheduler + picker.
- **Suggestion titles ship in Bahasa Indonesia** (end-user voice), emoji per habit.
- **Vernon Notification `type` must be one of the fixed capitalized Select options** — reminder uses `Encouragement` (no doctype change). Source: memory `vernon-notify-type-gotcha`.
- **Deploy:** after Python changes `sudo /usr/local/bin/tj-restart`; after doctype changes `bench migrate`; after frontend changes rebuild the bundle. App shape change → `python3 scripts/gen_docs.py`. User-visible ship → App Release row.
- **Restart wrapper:** `sudo /usr/local/bin/tj-restart` (passwordless). `bench restart` will fail — do not use.
- **Git:** work on branch `feat/habit-tracker` (already created). Commit only files this plan creates/edits; the repo has unrelated user WIP in the working tree — never `git add -A`, add exact paths only. Source: memory `vernon-user-parallel-remote-control`.

---

## File Structure

**New backend:**
- `vernon_project/vernon_project/doctype/habit/{__init__.py, habit.json, habit.py}` — the Habit doctype + owner isolation.
- `vernon_project/vernon_project/doctype/habit_log/{__init__.py, habit_log.json, habit_log.py}` — the check-in row doctype.
- `vernon_project/api/habit.py` — pure `_streak()` helper, suggestion constant, whitelisted endpoints.

**New frontend:**
- `frontend/src/pages/HabitsScreen.tsx` — mobile screen.
- `frontend-web/src/pages/Habits.tsx` — web screen.

**Edited backend:**
- `vernon_project/hooks.py` — `permission_query_conditions`, `has_permission`, `scheduler_events["daily"]`.
- `vernon_project/tasks.py` — `notify_habit_checkins`.
- `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json` — `habit_reminders` Check.
- `scripts/gen_docs.py` — add `Habit`/`Habit Log` to `CLUSTERS`.

**Edited frontend (shared, in `frontend/src`):**
- `frontend/src/lib/api.ts` — `habitApi` method object.
- `frontend/src/hooks/useData.ts` — `useHabits()` + mutations + query key.
- `frontend/src/lib/types.ts` — `Habit`, `HabitSuggestion`, `HabitWeekDot`.

**Edited frontend (per-platform routing/nav):**
- `frontend/src/App.tsx` — mobile route.
- `frontend/src/pages/Profile.tsx` — mobile Me-menu row.
- `frontend-web/src/App.tsx` — web route.
- `frontend-web/src/lib/nav.ts` — web nav leaf.

---

## Task 1: Habit + Habit Log doctypes

**Files:**
- Create: `vernon_project/vernon_project/doctype/habit/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/habit/habit.json`
- Create: `vernon_project/vernon_project/doctype/habit/habit.py`
- Create: `vernon_project/vernon_project/doctype/habit_log/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/habit_log/habit_log.json`
- Create: `vernon_project/vernon_project/doctype/habit_log/habit_log.py`
- Modify: `vernon_project/hooks.py` (`permission_query_conditions`, `has_permission`)

**Interfaces:**
- Produces: doctypes `Habit` (fields `user, title, icon, cadence, weekdays, active, disc_axis`) and `Habit Log` (fields `user, habit, date`); controller module functions `habit.get_permission_query_conditions(user)` and `habit.has_permission(doc, ptype, user)`.

- [ ] **Step 1: Create the two `__init__.py` files (empty)**

Both files are empty (0 bytes), matching every other doctype folder.

- [ ] **Step 2: Write `habit.json`**

```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "hash",
 "creation": "2026-07-29 00:00:00",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["user", "title", "icon", "cadence", "weekdays", "active", "disc_axis"],
 "fields": [
  {"fieldname": "user", "fieldtype": "Link", "label": "User", "options": "User", "reqd": 1, "search_index": 1, "in_list_view": 1},
  {"fieldname": "title", "fieldtype": "Data", "label": "Title", "reqd": 1, "in_list_view": 1},
  {"fieldname": "icon", "fieldtype": "Data", "label": "Icon"},
  {"fieldname": "cadence", "fieldtype": "Select", "label": "Cadence", "options": "Daily\nWeekdays", "default": "Daily", "reqd": 1},
  {"fieldname": "weekdays", "fieldtype": "Data", "label": "Weekdays (CSV 0=Mon..6=Sun)"},
  {"fieldname": "active", "fieldtype": "Check", "label": "Active", "default": "1"},
  {"fieldname": "disc_axis", "fieldtype": "Data", "label": "DISC Axis"}
 ],
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-07-29 00:00:00",
 "module": "Vernon Project",
 "name": "Habit",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "print": 1, "share": 1, "email": 1}
 ],
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 3: Write `habit_log.json`**

```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "hash",
 "creation": "2026-07-29 00:00:00",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["user", "habit", "date"],
 "fields": [
  {"fieldname": "user", "fieldtype": "Link", "label": "User", "options": "User", "reqd": 1, "search_index": 1, "in_list_view": 1},
  {"fieldname": "habit", "fieldtype": "Link", "label": "Habit", "options": "Habit", "reqd": 1, "search_index": 1, "in_list_view": 1},
  {"fieldname": "date", "fieldtype": "Date", "label": "Date", "reqd": 1, "search_index": 1, "in_list_view": 1}
 ],
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-07-29 00:00:00",
 "module": "Vernon Project",
 "name": "Habit Log",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "print": 1, "share": 1, "email": 1}
 ],
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 4: Write `habit.py` (controller with owner isolation, mirrors `personal_note.py`)**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Habit(Document):
	def before_insert(self):
		if not self.user:
			self.user = frappe.session.user


def get_permission_query_conditions(user=None):
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return ""
	return "`tabHabit`.`user` = {0}".format(frappe.db.escape(user))


def has_permission(doc, ptype="read", user=None):
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return True
	return doc.user == user
```

- [ ] **Step 5: Write `habit_log.py` (owner isolation, same shape)**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class HabitLog(Document):
	def before_insert(self):
		if not self.user:
			self.user = frappe.session.user


def get_permission_query_conditions(user=None):
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return ""
	return "`tabHabit Log`.`user` = {0}".format(frappe.db.escape(user))


def has_permission(doc, ptype="read", user=None):
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return True
	return doc.user == user
```

- [ ] **Step 6: Register isolation hooks in `hooks.py`**

In `permission_query_conditions = {...}` (the dict near line 151), add:

```python
	"Habit": "vernon_project.vernon_project.doctype.habit.habit.get_permission_query_conditions",
	"Habit Log": "vernon_project.vernon_project.doctype.habit_log.habit_log.get_permission_query_conditions",
```

In `has_permission = {...}` (near line 164), add:

```python
	"Habit": "vernon_project.vernon_project.doctype.habit.habit.has_permission",
	"Habit Log": "vernon_project.vernon_project.doctype.habit_log.habit_log.has_permission",
```

- [ ] **Step 7: Migrate and verify the doctypes exist + isolation works**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate 2>&1 | tail -5
```
Expected: migrate completes, no error mentioning Habit.

Verify a row round-trips and isolation query compiles:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
h = frappe.get_doc(dict(doctype="Habit", user="Administrator", title="TEST", cadence="Daily")).insert(ignore_permissions=True)
print("created", h.name, h.user, h.active)
frappe.delete_doc("Habit", h.name, ignore_permissions=True); frappe.db.commit()
print("ok")
EOF
```
Expected: prints `created <hash> Administrator 1` then `ok`.

- [ ] **Step 8: Commit**

```bash
git add vernon_project/vernon_project/doctype/habit vernon_project/vernon_project/doctype/habit_log vernon_project/hooks.py
git commit -m "feat(habit): Habit + Habit Log doctypes with owner isolation"
```

---

## Task 2: Pure streak helper `_streak()` + self-check (TDD)

This is the only non-trivial logic. It is pure (no DB) and runs with plain `python3`, so it gets a real assert-based self-check per the ponytail rule.

**Files:**
- Create: `vernon_project/api/habit.py` (start the module with just the helper + `__main__` self-check)

**Interfaces:**
- Produces: `_streak(log_dates: set[str], cadence: str, weekdays: set[int], today: datetime.date) -> tuple[int, int]` returning `(current_streak, best_streak)`. `log_dates` = set of `YYYY-MM-DD` strings that have a check-in.
- Produces: `_scheduled(d: datetime.date, cadence: str, weekdays: set[int]) -> bool`.

- [ ] **Step 1: Write the helper + failing-first self-check in `api/habit.py`**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

"""Personal habit tracker: per-user habits, streaks (no gamification),
DISC-personalized suggestions, and an admin-gated daily reminder.

Streak/schedule/suggestion logic is server-side so both frontends are identical.
`_streak`/`_scheduled` are pure (no frappe) and self-checked in __main__.
"""

import datetime


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
	current = 0
	d = today
	if _scheduled(d, cadence, weekdays) and not done(d):
		d = d - datetime.timedelta(days=1)  # today unchecked → don't penalize yet
	while True:
		if _scheduled(d, cadence, weekdays):
			if done(d):
				current += 1
			else:
				break
		d = d - datetime.timedelta(days=1)
		if (today - d).days > 366:  # safety bound
			break

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
	print("habit _streak self-check OK")


if __name__ == "__main__":
	demo()
```

> Note on the weekdays case: 2026-07-27 is a Monday, 2026-07-29 is a Wednesday. Verify this when implementing (`date(2026,7,27).weekday()` must be `0`). If the calendar differs, adjust the asserted dates, not the logic.

- [ ] **Step 2: Run the self-check, expect it to pass**

Run:
```bash
python3 /home/frappe/frappe-bench/apps/vernon_project/vernon_project/api/habit.py
```
Expected: `habit _streak self-check OK` and exit 0. If an assert fails, the logic (or the asserted calendar dates) is wrong — fix before proceeding.

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/habit.py
git commit -m "feat(habit): pure streak helper with self-check"
```

---

## Task 3: Habit API endpoints + DISC suggestions

**Files:**
- Modify: `vernon_project/api/habit.py` (append suggestions constant + whitelisted endpoints below the helper)

**Interfaces:**
- Consumes: `_streak`, `_scheduled` from Task 2; `Habit`/`Habit Log` doctypes from Task 1; `_ensure_employee_profile` from `vernon_project.vernon_project.doctype.employee_profile.employee_profile`.
- Produces whitelisted methods (dotted path `vernon_project.api.habit.<fn>`):
  - `get_habits() -> {habits: [...], suggestions: [...], disc_type: str}`
  - `create_habit(title, icon=None, cadence="Daily", weekdays=None, disc_axis=None) -> {name}`
  - `update_habit(habit, title=None, icon=None, cadence=None, weekdays=None) -> {ok}`
  - `delete_habit(habit) -> {ok}` (soft: `active=0`)
  - `toggle_habit(habit, date=None) -> {done_today, current_streak, best_streak}`
  - `adopt_suggestion(key) -> {name}`
- Each habit object shape: `{name, title, icon, cadence, weekdays: int[], active, scheduled_today, done_today, current_streak, best_streak, week: [{date, scheduled, done}]}`.
- Each suggestion shape: `{key, title, icon, cadence, weekdays: int[], disc_axis}`.

- [ ] **Step 1: Append the suggestions constant + helpers to `api/habit.py`**

Add `import frappe` and `import json` at the top of the module (keep `import datetime`). Then append:

```python
import json
import frappe

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
	"""CSV string or list -> sorted list of ints 0..6."""
	if not csv:
		return []
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


def _suggestions_for(user, existing_titles):
	disc = _disc_type(user)
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
```

- [ ] **Step 2: Append `get_habits` (the read endpoint that assembles streaks + week strip)**

```python
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
	return {
		"habits": habits,
		"suggestions": _suggestions_for(user, existing_titles),
		"disc_type": _disc_type(user),
	}
```

- [ ] **Step 3: Append the mutation endpoints**

```python
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
```

- [ ] **Step 4: Restart, then verify the endpoints through the real API**

Run:
```bash
sudo /usr/local/bin/tj-restart
```

Verify create → get → toggle → get:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
frappe.set_user("Administrator")
r = frappe.call("vernon_project.api.habit.create_habit", title="Minum air", icon="💧", cadence="Daily")
name = r["name"]; print("created", name)
frappe.call("vernon_project.api.habit.toggle_habit", habit=name)
g = frappe.call("vernon_project.api.habit.get_habits")
h = [x for x in g["habits"] if x["name"] == name][0]
print("done_today", h["done_today"], "streak", h["current_streak"], "week_len", len(h["week"]))
print("suggestions", len(g["suggestions"]), "disc", g["disc_type"])
# cleanup
frappe.db.set_value("Habit", name, "active", 0)
for lg in frappe.get_all("Habit Log", filters={"habit": name}, pluck="name"):
    frappe.delete_doc("Habit Log", lg, ignore_permissions=True)
frappe.db.commit(); print("cleaned")
EOF
```
Expected: `done_today True streak 1 week_len 7`, a non-zero `suggestions` count, then `cleaned`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/habit.py
git commit -m "feat(habit): API endpoints + DISC-personalized suggestions"
```

---

## Task 4: Daily reminder task + settings toggle

**Files:**
- Modify: `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json` (add `habit_reminders` Check)
- Modify: `vernon_project/tasks.py` (add `notify_habit_checkins`)
- Modify: `vernon_project/hooks.py` (`scheduler_events["daily"]`)

**Interfaces:**
- Consumes: `_notify` from `vernon_project.api.mobile`; `Habit`/`Habit Log` from Task 1; `_scheduled`/`_parse_weekdays` from `api.habit`.
- Produces: scheduled function `vernon_project.tasks.notify_habit_checkins()`; settings field `habit_reminders`.

- [ ] **Step 1: Add the `habit_reminders` Check to `vernon_settings.json`**

Find the block of existing `Check` toggles (e.g. `sweep_stale_plans`). Add this field object to the `fields` array and add `"habit_reminders"` to `field_order` right after `sweep_stale_plans`:

```json
{"fieldname": "habit_reminders", "fieldtype": "Check", "label": "Habit Reminders", "default": "0"}
```

- [ ] **Step 2: Add `notify_habit_checkins` to `tasks.py`**

Append (near the other notify tasks; match the file's tab indentation):

```python
def notify_habit_checkins():
	"""Once/day: nudge users who have an active habit scheduled today but no
	check-in yet. Admin-gated by Vernon Settings.habit_reminders (default off).
	Dedup per-user-per-day on Vernon Notification (type Encouragement, ref Habit).
	"""
	if not frappe.db.get_single_value("Vernon Settings", "habit_reminders"):
		return 0
	from vernon_project.api.habit import _scheduled, _parse_weekdays
	from vernon_project.api.mobile import _notify

	today = frappe.utils.getdate(frappe.utils.today())
	today_iso = today.isoformat()
	habits = frappe.get_all(
		"Habit", filters={"active": 1},
		fields=["name", "user", "cadence", "weekdays"], limit_page_length=0,
	)
	# users with a habit scheduled today
	scheduled_users = {}
	for h in habits:
		if _scheduled(today, h.cadence, set(_parse_weekdays(h.weekdays))):
			scheduled_users.setdefault(h.user, []).append(h.name)
	if not scheduled_users:
		return 0
	# users who already logged ANY habit today
	logged = set(frappe.get_all(
		"Habit Log", filters={"date": today, "user": ["in", list(scheduled_users)]},
		pluck="user", limit_page_length=0,
	))
	sent = 0
	for user, names in scheduled_users.items():
		if user in logged:
			continue
		if frappe.db.exists("Vernon Notification", {
			"recipient": user, "type": "Encouragement",
			"reference_doctype": "Habit", "creation": [">=", today_iso],
		}):
			continue
		_notify(
			recipient=user, type="Encouragement",
			title="Kebiasaanmu menunggu 🌱",
			body="Belum ada centang hari ini. Yuk selesaikan satu kebiasaan.",
			reference_doctype="Habit", reference_name=names[0],
		)
		sent += 1
	return sent
```

- [ ] **Step 3: Register the task in `hooks.py` `scheduler_events["daily"]`**

Add to the `"daily"` list:
```python
		"vernon_project.tasks.notify_habit_checkins",
```

- [ ] **Step 4: Migrate (new settings field) + restart**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate 2>&1 | tail -3 && sudo /usr/local/bin/tj-restart
```

- [ ] **Step 5: Verify the task is a no-op while the toggle is off, and sends when on**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
from vernon_project.tasks import notify_habit_checkins
print("off →", notify_habit_checkins())  # expect 0 (toggle default off)
EOF
```
Expected: `off → 0`. (Do not enable the toggle in production; on/off behavior is exercised only if an admin turns it on. The `0` proves the gate works.)

- [ ] **Step 6: Commit**

```bash
git add vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json vernon_project/tasks.py vernon_project/hooks.py
git commit -m "feat(habit): admin-gated daily check-in reminder"
```

---

## Task 5: Shared frontend data layer

**Files:**
- Modify: `frontend/src/lib/types.ts` (add `Habit`, `HabitSuggestion`, `HabitWeekDot`)
- Modify: `frontend/src/lib/api.ts` (add `habitApi`)
- Modify: `frontend/src/hooks/useData.ts` (add `useHabits` + mutations + query key)

**Interfaces:**
- Consumes: the whitelisted endpoints from Task 3.
- Produces: `useHabits()` returning `{habits, suggestions, disc_type}`; mutation hooks `useCreateHabit`, `useUpdateHabit`, `useDeleteHabit`, `useToggleHabit`, `useAdoptSuggestion` — all invalidate `keys.habits`.

- [ ] **Step 1: Add types to `types.ts`**

```typescript
export interface HabitWeekDot { date: string; scheduled: boolean; done: boolean }
export interface Habit {
  name: string
  title: string
  icon: string
  cadence: 'Daily' | 'Weekdays'
  weekdays: number[]
  active: number
  scheduled_today: boolean
  done_today: boolean
  current_streak: number
  best_streak: number
  week: HabitWeekDot[]
}
export interface HabitSuggestion {
  key: string
  title: string
  icon: string
  cadence: 'Daily' | 'Weekdays'
  weekdays: number[]
  disc_axis: string
}
export interface HabitsResponse {
  habits: Habit[]
  suggestions: HabitSuggestion[]
  disc_type: string
}
```

- [ ] **Step 2: Add `habitApi` to `api.ts`**

Near the other namespace constants add `const H = 'vernon_project.api.habit.'`, then add the method object (place it beside `getPersonalNotes` etc.):

```typescript
export const habitApi = {
  getHabits: () => api.get<import('./types').HabitsResponse>(H + 'get_habits'),
  createHabit: (title: string, icon: string, cadence: string, weekdays: number[]) =>
    api.post<{ name: string }>(H + 'create_habit', { title, icon, cadence, weekdays: JSON.stringify(weekdays) }),
  updateHabit: (habit: string, patch: { title?: string; icon?: string; cadence?: string; weekdays?: number[] }) =>
    api.post<{ ok: number }>(H + 'update_habit', {
      habit, ...patch,
      ...(patch.weekdays ? { weekdays: JSON.stringify(patch.weekdays) } : {}),
    }),
  deleteHabit: (habit: string) => api.post<{ ok: number }>(H + 'delete_habit', { habit }),
  toggleHabit: (habit: string, date?: string) =>
    api.post<{ done_today: boolean; current_streak: number; best_streak: number }>(H + 'toggle_habit', { habit, date }),
  adoptSuggestion: (key: string) => api.post<{ name: string }>(H + 'adopt_suggestion', { key }),
}
```

> Note: the Python `_parse_weekdays` accepts a JSON string or a CSV; sending `JSON.stringify(number[])` works because `frappe` passes it as a string and `_parse_weekdays` first tries `.split(",")` — but a JSON array string `"[0,2,4]"` splits to `["[0","2","4]"]`. **Therefore send CSV, not JSON**, for weekdays. Correct the two `weekdays:` lines to `weekdays: weekdays.join(',')` and `weekdays: patch.weekdays.join(',')`. (The `int()` parse in `_parse_weekdays` strips nothing else, and CSV is what the Data field stores.)

- [ ] **Step 3: Add the hook + mutations to `useData.ts`**

Add the query key to the `keys` registry: `habits: ['habits'] as const,`. Then:

```typescript
import { habitApi } from '../lib/api'
import type { HabitsResponse } from '../lib/types'

export function useHabits() {
  return useQuery({ queryKey: keys.habits, queryFn: () => habitApi.getHabits() as Promise<HabitsResponse> })
}
export function useCreateHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { title: string; icon: string; cadence: string; weekdays: number[] }) =>
      habitApi.createHabit(v.title, v.icon, v.cadence, v.weekdays),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.habits }),
  })
}
export function useUpdateHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { habit: string; patch: { title?: string; icon?: string; cadence?: string; weekdays?: number[] } }) =>
      habitApi.updateHabit(v.habit, v.patch),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.habits }),
  })
}
export function useDeleteHabit() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (habit: string) => habitApi.deleteHabit(habit), onSettled: () => qc.invalidateQueries({ queryKey: keys.habits }) })
}
export function useToggleHabit() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (v: { habit: string; date?: string }) => habitApi.toggleHabit(v.habit, v.date), onSettled: () => qc.invalidateQueries({ queryKey: keys.habits }) })
}
export function useAdoptSuggestion() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (key: string) => habitApi.adoptSuggestion(key), onSettled: () => qc.invalidateQueries({ queryKey: keys.habits }) })
}
```

> Match the file's existing import style (it already imports `useQuery`, `useMutation`, `useQueryClient`, `mobileApi`). Don't duplicate imports — add `habitApi` to the existing `../lib/api` import if one exists, else add the line shown.

- [ ] **Step 4: Typecheck both frontends compile**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit 2>&1 | tail -15
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit 2>&1 | tail -15
```
Expected: no new errors referencing `habit`/`Habit`. (Pre-existing unrelated errors, if any, are out of scope — confirm none mention habit.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(habit): shared frontend data layer (types, api, hooks)"
```

---

## Task 6: Mobile screen (`/m`)

**Files:**
- Create: `frontend/src/pages/HabitsScreen.tsx`
- Modify: `frontend/src/App.tsx` (route)
- Modify: `frontend/src/pages/Profile.tsx` (Me-menu row)

**Interfaces:**
- Consumes: `useHabits`, `useToggleHabit`, `useCreateHabit`, `useDeleteHabit`, `useAdoptSuggestion` from Task 5.

- [ ] **Step 1: Create `HabitsScreen.tsx`**

Functional screen wiring the shared hooks. Styling should match the app's Soft-Pop conventions (paper-* tokens, rounded cards, lucide icons, `animate-*`) — read a neighboring screen like `NotesScreen.tsx` for the exact card/header components and reuse them. The data wiring below is the contract; swap the plain elements for the app's card primitives where they exist.

```tsx
import { useState } from 'react'
import { Flame, Plus, Check, Trash2, Sparkles } from 'lucide-react'
import { useHabits, useToggleHabit, useCreateHabit, useDeleteHabit, useAdoptSuggestion } from '../hooks/useData'
import type { Habit, HabitWeekDot } from '../lib/types'

const DOW = ['S', 'S', 'R', 'K', 'J', 'S', 'M'] // Sen..Min short; index by dot order below

function WeekStrip({ week }: { week: HabitWeekDot[] }) {
  return (
    <div className="flex gap-1.5 mt-2">
      {week.map((d) => (
        <span key={d.date}
          title={d.date}
          className={
            'h-2.5 w-2.5 rounded-full ' +
            (d.done ? 'bg-emerald-500' : d.scheduled ? 'bg-paper-300' : 'bg-paper-100')
          } />
      ))}
    </div>
  )
}

function HabitCard({ h }: { h: Habit }) {
  const toggle = useToggleHabit()
  const del = useDeleteHabit()
  return (
    <div className="rounded-3xl bg-white p-4 shadow-soft flex items-start gap-3">
      <button
        aria-label={h.done_today ? 'Batalkan centang' : 'Tandai selesai'}
        onClick={() => toggle.mutate({ habit: h.name })}
        className={
          'h-11 w-11 shrink-0 rounded-full grid place-items-center transition ' +
          (h.done_today ? 'bg-emerald-500 text-white' : 'bg-paper-100 text-paper-400')
        }>
        {h.done_today ? <Check size={22} /> : <span className="text-xl">{h.icon || '•'}</span>}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold truncate">{h.icon} {h.title}</p>
          <button aria-label="Arsipkan" onClick={() => del.mutate(h.name)} className="text-paper-300 hover:text-rose-500">
            <Trash2 size={16} />
          </button>
        </div>
        <div className="flex items-center gap-1 text-sm text-orange-500 mt-0.5">
          <Flame size={14} /> {h.current_streak} hari
          {h.best_streak > h.current_streak && <span className="text-paper-400 ml-1">· rekor {h.best_streak}</span>}
        </div>
        <WeekStrip week={h.week} />
      </div>
    </div>
  )
}

export default function HabitsScreen() {
  const { data, isLoading } = useHabits()
  const create = useCreateHabit()
  const adopt = useAdoptSuggestion()
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState('✅')

  if (isLoading) return <div className="p-6 text-paper-400">Memuat…</div>
  const habits = data?.habits ?? []
  const suggestions = data?.suggestions ?? []

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-2xl font-bold">Kebiasaan</h1>

      {habits.length === 0 && (
        <p className="text-paper-400">Belum ada kebiasaan. Tambahkan satu, atau adopsi saran di bawah.</p>
      )}
      <div className="space-y-3">
        {habits.map((h) => <HabitCard key={h.name} h={h} />)}
      </div>

      {/* add new */}
      <div className="rounded-3xl bg-white p-4 shadow-soft flex items-center gap-2">
        <input value={icon} onChange={(e) => setIcon(e.target.value)} className="w-12 text-center rounded-xl bg-paper-100 py-2" maxLength={2} aria-label="Emoji" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kebiasaan baru…" className="flex-1 rounded-xl bg-paper-100 px-3 py-2" />
        <button
          disabled={!title.trim() || create.isPending}
          onClick={() => { create.mutate({ title: title.trim(), icon, cadence: 'Daily', weekdays: [] }); setTitle(''); setIcon('✅') }}
          className="h-10 w-10 grid place-items-center rounded-full bg-indigo-600 text-white disabled:opacity-40">
          <Plus size={20} />
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1 font-semibold text-paper-500"><Sparkles size={16} /> Disarankan untukmu{data?.disc_type ? ` (${data.disc_type})` : ''}</p>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div key={s.key} className="rounded-2xl bg-paper-50 p-3 flex items-center gap-2">
                <span className="text-xl">{s.icon}</span>
                <span className="flex-1 text-sm">{s.title}</span>
                <button onClick={() => adopt.mutate(s.key)} className="text-sm font-medium text-indigo-600">+ Tambah</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

> The `cadence: 'Weekdays'` + weekday `MultiSelectSearch` picker is deferred from this screen's add-box for v1 simplicity (new habits default Daily); adopting a suggestion can still create a Weekdays habit. Add a full edit sheet with the weekday picker only if asked — v1 ships Daily-create + suggestion-adopt. `// ponytail: Daily-only quick-add; weekday picker when a user needs custom weekdays on their own habit`.

- [ ] **Step 2: Register the mobile route in `App.tsx`**

Add the import near the other page imports:
```tsx
import HabitsScreen from './pages/HabitsScreen'
```
Add the route inside `<Routes>` (beside `/notes`):
```tsx
<Route path="/habits" element={<HabitsScreen />} />
```

- [ ] **Step 3: Add the Me-menu row in `Profile.tsx`**

In the menu data structure (the `groups[].rows[]` around line 154), add a row (choose an appropriate `hue` used elsewhere, import `Flame` from lucide if not already imported):
```tsx
{ icon: Flame, label: 'Kebiasaan', hue: 'orange', onClick: () => navigate('/habits') },
```

- [ ] **Step 4: Build the mobile bundle and verify it compiles + contains the screen**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build 2>&1 | tail -8
grep -rl "Disarankan untukmu" ../vernon_project/public/frontend/assets/*.js | head -1
```
Expected: build succeeds; grep prints a bundle path (the string shipped).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/HabitsScreen.tsx frontend/src/App.tsx frontend/src/pages/Profile.tsx vernon_project/public/frontend
git commit -m "feat(habit): mobile Habits screen (/m)"
```

---

## Task 7: Web screen (`/w`)

**Files:**
- Create: `frontend-web/src/pages/Habits.tsx`
- Modify: `frontend-web/src/App.tsx` (route)
- Modify: `frontend-web/src/lib/nav.ts` (nav leaf)

**Interfaces:**
- Consumes: the same shared hooks (imported from `@/hooks/useData`) + types from `@/lib/types`.

- [ ] **Step 1: Create `Habits.tsx` (web bento styling)**

Reuse the shared hooks via the `@` alias. Match the web bento-tile conventions — read a neighboring web page like `Notes.tsx` for the exact tile/section components and reuse them; the wiring below is the contract.

```tsx
import { useState } from 'react'
import { Flame, Plus, Check, Trash2, Sparkles } from 'lucide-react'
import { useHabits, useToggleHabit, useCreateHabit, useDeleteHabit, useAdoptSuggestion } from '@/hooks/useData'
import type { Habit, HabitWeekDot } from '@/lib/types'

function WeekStrip({ week }: { week: HabitWeekDot[] }) {
  return (
    <div className="flex gap-1.5 mt-2">
      {week.map((d) => (
        <span key={d.date} title={d.date}
          className={'h-2.5 w-2.5 rounded-full ' + (d.done ? 'bg-emerald-500' : d.scheduled ? 'bg-slate-300' : 'bg-slate-100')} />
      ))}
    </div>
  )
}

function HabitTile({ h }: { h: Habit }) {
  const toggle = useToggleHabit()
  const del = useDeleteHabit()
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <button onClick={() => toggle.mutate({ habit: h.name })}
          aria-label={h.done_today ? 'Batalkan centang' : 'Tandai selesai'}
          className={'h-10 w-10 rounded-full grid place-items-center transition ' + (h.done_today ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400')}>
          {h.done_today ? <Check size={20} /> : <span className="text-lg">{h.icon || '•'}</span>}
        </button>
        <button aria-label="Arsipkan" onClick={() => del.mutate(h.name)} className="text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>
      </div>
      <p className="font-semibold truncate">{h.icon} {h.title}</p>
      <div className="flex items-center gap-1 text-sm text-orange-500"><Flame size={14} /> {h.current_streak} hari{h.best_streak > h.current_streak && <span className="text-slate-400 ml-1">· rekor {h.best_streak}</span>}</div>
      <WeekStrip week={h.week} />
    </div>
  )
}

export default function Habits() {
  const { data, isLoading } = useHabits()
  const create = useCreateHabit()
  const adopt = useAdoptSuggestion()
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState('✅')

  if (isLoading) return <div className="p-8 text-slate-400">Memuat…</div>
  const habits = data?.habits ?? []
  const suggestions = data?.suggestions ?? []

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Kebiasaan</h1>

      <div className="flex items-center gap-2 max-w-lg">
        <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={2} aria-label="Emoji" className="w-12 text-center rounded-lg border border-slate-200 py-2" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kebiasaan baru…" className="flex-1 rounded-lg border border-slate-200 px-3 py-2" />
        <button disabled={!title.trim() || create.isPending}
          onClick={() => { create.mutate({ title: title.trim(), icon, cadence: 'Daily', weekdays: [] }); setTitle(''); setIcon('✅') }}
          className="h-10 px-4 rounded-lg bg-indigo-600 text-white disabled:opacity-40 flex items-center gap-1"><Plus size={18} /> Tambah</button>
      </div>

      {habits.length === 0
        ? <p className="text-slate-400">Belum ada kebiasaan. Tambahkan satu, atau adopsi saran di bawah.</p>
        : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{habits.map((h) => <HabitTile key={h.name} h={h} />)}</div>}

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1 font-semibold text-slate-600"><Sparkles size={16} /> Disarankan untukmu{data?.disc_type ? ` (${data.disc_type})` : ''}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestions.map((s) => (
              <div key={s.key} className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center gap-2">
                <span className="text-xl">{s.icon}</span>
                <span className="flex-1 text-sm">{s.title}</span>
                <button onClick={() => adopt.mutate(s.key)} className="text-sm font-medium text-indigo-600">+ Tambah</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Register the web route in `App.tsx`**

Import near other `@web/pages/*` imports:
```tsx
import Habits from '@web/pages/Habits'
```
Add inside the `<Route element={<AppShell />}>` block (beside `/notes`):
```tsx
<Route path="/habits" element={<Habits />} />
```

- [ ] **Step 3: Add the nav leaf in `nav.ts`**

Import `Flame` from lucide at the top of `nav.ts`, then add to the `WORK` array (no gate — personal):
```tsx
{ to: '/habits', label: 'Kebiasaan', sub: 'Pelacak kebiasaan pribadi', icon: Flame },
```

- [ ] **Step 4: Build the web bundle and verify**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build 2>&1 | tail -8
grep -rl "Disarankan untukmu" ../vernon_project/public/frontend_web/assets/*.js | head -1
```
Expected: build succeeds; grep prints a bundle path.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/Habits.tsx frontend-web/src/App.tsx frontend-web/src/lib/nav.ts vernon_project/public/frontend_web
git commit -m "feat(habit): web Habits screen (/w)"
```

---

## Task 8: Docs regen, ship, and What's New

**Files:**
- Modify: `scripts/gen_docs.py` (add `Habit`, `Habit Log` to `CLUSTERS`)
- Generated: `docs/assets/data.js`

- [ ] **Step 1: Add the two doctypes to the `CLUSTERS` map in `gen_docs.py`**

Open `scripts/gen_docs.py`, find the `CLUSTERS` dict, and add `Habit` and `Habit Log` to the most fitting cluster (a personal/wellbeing or "Me" cluster; match where `Personal Note`/`Focus Timer` live). Use their exact cluster key.

- [ ] **Step 2: Regenerate docs data and confirm it's deterministic + non-empty**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --stat docs/assets/data.js
```
Expected: exits 0 (no "missing from CLUSTERS" error), `data.js` shows a diff including Habit.

- [ ] **Step 3: Final restart + confirm both screens are live against the built bundle**

```bash
sudo /usr/local/bin/tj-restart
grep -c "get_habits" /home/frappe/frappe-bench/apps/vernon_project/vernon_project/public/frontend/assets/*.js
grep -c "get_habits" /home/frappe/frappe-bench/apps/vernon_project/vernon_project/public/frontend_web/assets/*.js
```
Expected: both greps ≥ 1 (endpoint wired into both shipped bundles).

- [ ] **Step 4: Commit docs**

```bash
git add scripts/gen_docs.py docs/assets/data.js
git commit -m "docs(habit): regenerate docs data for Habit doctypes"
```

- [ ] **Step 5: Insert the What's New App Release row**

Determine the newest existing version, bump minor (feature). Write `/tmp/claude-1000/.../scratchpad/habit_release.json`:
```json
[{"version": "<bumped>", "release_date": "2026-07-29", "title": "Pelacak Kebiasaan", "notes": "Bangun kebiasaan harianmu dan lihat rentetan (streak) 🔥 (/m & /w)\nDapat saran kebiasaan yang dipersonalisasi dari tipe DISC-mu\nCentang tiap hari, lihat progres 7 hari terakhir\nTambах kebiasaanmu sendiri kapan saja", "platform": "Both", "published": 1}]
```
(Fix the typo `Tambах`→`Tambah`; Bahasa, one bullet per line, biggest item first.) Do **not** announce the reminder — it's default-off. Insert loop-free (single line, per CLAUDE.md):
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/e80c8b4d-7171-4c71-b024-0995ac8aafaf/scratchpad/habit_release.json"))])
frappe.db.commit()
EOF
```
Verify through the real endpoint:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([r["version"] for r in frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")][:3])
EOF
```
Expected: the new version appears first.

- [ ] **Step 6: Final verification checklist (manual)**

- Open `/m` → Me → Kebiasaan: add a habit, check it, streak shows 1, week strip shows a filled dot today.
- Open `/w` → nav → Kebiasaan: same round-trip.
- Confirm a suggestion appears and "+ Tambah" adopts it (it then disappears from suggestions).
- Confirm the What's New entry renders on both platforms.

---

## Self-Review (completed during authoring)

**Spec coverage:** §2 doctypes → Task 1. §3 streak logic → Task 2 (+ used in Task 3). §4 suggestions/DISC → Task 3. §5 reminder+toggle → Task 4. §6 frontend (shared + both screens) → Tasks 5–7. §7 ship sequence → Task 8. §8 scope cuts honored (no points, one daily reminder, 7-dot week + best streak only, code-curated suggestions, Daily/Weekdays only, soft-delete).

**Placeholder scan:** none — all code is concrete. Two deliberate simplifications are marked `// ponytail:` (Daily-only quick-add; reminder type reuse) with upgrade paths.

**Type consistency:** `Habit`/`HabitSuggestion`/`HabitWeekDot`/`HabitsResponse` identical across Task 5 (definition) and Tasks 6–7 (consumers). Endpoint names match Task 3 ↔ Task 5 (`get_habits`, `create_habit`, `update_habit`, `delete_habit`, `toggle_habit`, `adopt_suggestion`). Weekday transport corrected to **CSV** in both Python (`_parse_weekdays`) and the JS `habitApi` note.

**Known verify-at-implementation points:** (a) exact insertion anchors in `App.tsx`/`Profile.tsx`/`nav.ts` — read the file, place beside the `/notes` precedent; (b) reuse the neighbor screens' real card/tile primitives instead of the plain elements shown; (c) confirm `date(2026,7,27).weekday()==0` for the Task 2 weekday assert; (d) exact `CLUSTERS` key in `gen_docs.py`.
