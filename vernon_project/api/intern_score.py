# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Intern score engine.
#
# Two scores, deliberately never merged into one:
#
#   auto   — derived from what the app already recorded (todos, attendance, points,
#            courses). Nobody types it.
#   rubric — what the project leader judges (discipline, quality, initiative, ...).
#
# Averaging them would hide the interesting case: the intern whose numbers are ordinary
# but whose leader rates them highly, or the reverse. Both go on the certificate, side
# by side, each with its own label.
#
# Everything here is pure — plain dicts in, plain dicts out, no frappe import. The DB
# reads live in api/certificate.py so this file stays exhaustively unit-testable.

# --- statuses -----------------------------------------------------------------------
STATUS_COMPLETED = "✅ Completed"
STATUS_DONE = "\U0001f7e0 Done"           # 🟠 delivered by the intern, leader has not reviewed
STATUS_CHECKED = "\U0001f537 Checked By PL"  # 🔷 leader checked, not yet closed
STATUS_CANCELLED = "\U0001f6ab Cancelled"

# Work the intern has actually finished. Done/Checked are included on purpose: the
# intern's part is over and only the leader's review is outstanding. Scoring those as
# incomplete would charge the intern for someone else's unread inbox.
DELIVERED = (STATUS_COMPLETED, STATUS_DONE, STATUS_CHECKED)

# --- component weights (auto score) -------------------------------------------------
# (key, Bahasa label, weight). Weights sum to 100 — see test_auto_weights_sum_to_100.
WEIGHTS = (
	("completion", "Penyelesaian Tugas", 30),
	("timeliness", "Ketepatan Waktu", 25),
	("attendance", "Kehadiran", 20),
	("contribution", "Kontribusi Poin", 15),
	("learning", "Pembelajaran", 10),
)

# --- rubric definition (leader's judgement) -----------------------------------------
# ponytail: a constant, not an admin-editable doctype. Configurable weights would mean
# every issued certificate has to remember which version of the rubric scored it.
RUBRIC = (
	("quality", "Kualitas Kerja", 30),
	("discipline", "Kedisiplinan", 20),
	("initiative", "Inisiatif", 20),
	("collaboration", "Kolaborasi", 15),
	("communication", "Komunikasi", 15),
)

# High to low; first band whose cut the score reaches wins.
GRADE_BANDS = ((85, "A"), (70, "B"), (55, "C"), (0, "D"))


def _num(x, default=0.0):
	"""Tolerate the strings a JSON round-trip through the browser leaves behind."""
	try:
		return float(x)
	except (TypeError, ValueError):
		return default


def _clamp(x):
	return max(0.0, min(100.0, x))


def _pct(num, den):
	"""Percentage, or None when there is no denominator. None means 'not measured' and
	drops the component; it must never collapse to 0, which means 'measured, failed'."""
	den = _num(den)
	if den <= 0:
		return None
	return _clamp(_num(num) / den * 100.0)


def _date(x):
	"""Leading date part of a date or datetime, as a comparable string. Dates arrive as
	'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS'; both compare correctly on the first 10 chars."""
	if not x:
		return None
	return str(x)[:10]


def grade_for(score):
	if score is None:
		return None
	for cut, letter in GRADE_BANDS:
		if score >= cut:
			return letter
	return GRADE_BANDS[-1][1]


def split_grade(auto_score, rubric_score):
	"""Grades for the two scores. Returns them apart on purpose — there is no combined
	number anywhere in this app, and adding one later should be a deliberate decision."""
	return {"auto_grade": grade_for(auto_score), "rubric_grade": grade_for(rubric_score)}


def _todo_ratios(todos):
	"""(completion, timeliness) as (num, den) pairs.

	completion — delivered / (everything except cancelled). Cancelled work never
	happened; leaving it in the denominator would punish the intern for a change of plan.

	timeliness — of the delivered todos that have BOTH a deadline and a done date, how
	many landed on or before it. A todo with no deadline cannot be late, so it is
	excluded rather than counted as on time (which would inflate the score for free)."""
	todos = todos or []
	live = [t for t in todos if (t.get("status") or "") != STATUS_CANCELLED]
	delivered = [t for t in live if (t.get("status") or "") in DELIVERED]

	judged = [t for t in delivered if _date(t.get("deadline")) and _date(t.get("done_on"))]
	on_time = [t for t in judged if _date(t["done_on"]) <= _date(t["deadline"])]

	return (len(delivered), len(live)), (len(on_time), len(judged))


def compute_auto_score(todos=None, attendance=None, points=None, courses=None):
	"""The objective half of the intern score.

	Returns {"auto_score", "grade", "components": [...]}. A component with no
	denominator is DROPPED and the surviving weights are renormalised — an intern
	enrolled in no courses must not lose the 10 points that component carries. When
	nothing at all can be measured the score is None, not 0: "no evidence" and
	"evidence of failure" are different answers and the UI shows them differently."""
	attendance = attendance or {}
	points = points or {}
	courses = courses or {}

	(done_n, done_d), (ontime_n, ontime_d) = _todo_ratios(todos)

	raw = {
		"completion": (_pct(done_n, done_d), f"{done_n}/{done_d}"),
		"timeliness": (_pct(ontime_n, ontime_d), f"{ontime_n}/{ontime_d}"),
		"attendance": (
			_pct(attendance.get("present"), attendance.get("scheduled")),
			f"{_num(attendance.get('present')):.0f}/{_num(attendance.get('scheduled')):.0f} hari",
		),
		"contribution": (
			_pct(points.get("earned"), points.get("target")),
			f"{_num(points.get('earned')):.0f}/{_num(points.get('target')):.0f} poin",
		),
		"learning": (
			_pct(courses.get("completed"), courses.get("enrolled")),
			f"{_num(courses.get('completed')):.0f}/{_num(courses.get('enrolled')):.0f} kelas",
		),
	}

	components, weighted, total_weight = [], 0.0, 0.0
	for key, label, weight in WEIGHTS:
		value, detail = raw[key]
		if value is None:
			continue  # not measured -> dropped, see docstring
		weighted += value * weight
		total_weight += weight
		components.append({
			"key": key, "label": label, "weight": weight,
			"value": round(value, 1), "points": round(value * weight / 100.0, 1),
			"detail": detail,
		})

	score = round(weighted / total_weight, 1) if total_weight else None
	return {"auto_score": score, "grade": grade_for(score), "components": components}


def compute_rubric_score(rows):
	"""Weighted mean of the leader's rubric lines. Unscored lines are ignored, not read
	as zero — a half-filled rubric should read as incomplete, not as a bad review.
	Returns None when nothing is scored."""
	weighted = total = 0.0
	for r in rows or []:
		if r.get("score") is None or r.get("score") == "":
			continue
		w = _num(r.get("weight"))
		if w <= 0:
			continue
		weighted += _clamp(_num(r.get("score"))) * w
		total += w
	return round(weighted / total, 1) if total else None


def blank_rubric():
	"""The rubric a leader starts from: every line present, none scored yet."""
	return [{"key": k, "label": lbl, "weight": w, "score": None, "comment": ""}
		for k, lbl, w in RUBRIC]
