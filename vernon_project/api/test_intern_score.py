# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Pure-function tests for the intern score engine. No DB, no bench: everything under
# test takes plain dicts, so this runs with `python3 -m unittest` from the app root.

import unittest

from vernon_project.api.intern_score import (
	GRADE_BANDS, RUBRIC, WEIGHTS,
	compute_auto_score, compute_rubric_score, grade_for, split_grade,
)

COMPLETED = "✅ Completed"           # ✅ Completed
DELIVERED = "\U0001f7e0 Done"            # 🟠 Done — intern delivered, leader has not reviewed
CHECKED = "\U0001f537 Checked By PL"     # 🔷 Checked By PL
CANCELLED = "\U0001f6ab Cancelled"       # 🚫 Cancelled
PLANNED = "⚪️ Planned"              # ⚪️ Planned
DONE = COMPLETED


def todo(status=PLANNED, deadline=None, done_on=None):
	return {"status": status, "deadline": deadline, "done_on": done_on}


def done(deadline=None, done_on=None):
	return todo(DONE, deadline, done_on)


# A full, unambiguous input where every component has a denominator.
FULL = dict(
	todos=[done("2026-08-10", "2026-08-09"), done("2026-08-11", "2026-08-11")],
	attendance={"scheduled": 10, "present": 10},
	points={"earned": 100.0, "target": 100.0},
	courses={"enrolled": 2, "completed": 2},
)


def score(**over):
	kw = dict(FULL)
	kw.update(over)
	return compute_auto_score(**kw)


def comp(out, key):
	for c in out["components"]:
		if c["key"] == key:
			return c
	return None


class TestWeights(unittest.TestCase):
	def test_auto_weights_sum_to_100(self):
		self.assertEqual(sum(w for _, _, w in WEIGHTS), 100)

	def test_rubric_weights_sum_to_100(self):
		self.assertEqual(sum(w for _, _, w in RUBRIC), 100)

	def test_keys_are_unique(self):
		self.assertEqual(len({k for k, _, _ in WEIGHTS}), len(WEIGHTS))
		self.assertEqual(len({k for k, _, _ in RUBRIC}), len(RUBRIC))


class TestPerfectAndZero(unittest.TestCase):
	def test_everything_perfect_is_100(self):
		out = score()
		self.assertEqual(out["auto_score"], 100.0)
		self.assertEqual(out["grade"], "A")
		self.assertEqual(len(out["components"]), len(WEIGHTS))

	def test_everything_zero_is_0(self):
		out = score(
			todos=[todo(), todo()],
			attendance={"scheduled": 10, "present": 0},
			points={"earned": 0, "target": 100},
			courses={"enrolled": 2, "completed": 0},
		)
		self.assertEqual(out["auto_score"], 0.0)
		self.assertEqual(out["grade"], "D")

	def test_half_everywhere_is_50(self):
		out = score(
			todos=[done("2026-08-10", "2026-08-20"), done("2026-08-10", "2026-08-01"),
				todo(), todo()],
			attendance={"scheduled": 10, "present": 5},
			points={"earned": 50, "target": 100},
			courses={"enrolled": 2, "completed": 1},
		)
		# completion 2/4, timeliness 1/2, attendance 5/10, points 50/100, learning 1/2
		self.assertEqual(out["auto_score"], 50.0)
		self.assertEqual(out["grade"], "D")


class TestCompletion(unittest.TestCase):
	def test_cancelled_todos_leave_the_denominator(self):
		out = score(todos=[done(), todo(CANCELLED), todo(CANCELLED)])
		self.assertEqual(comp(out, "completion")["value"], 100.0)
		self.assertEqual(comp(out, "completion")["detail"], "1/1")

	def test_only_cancelled_todos_drops_completion(self):
		out = score(todos=[todo(CANCELLED)])
		self.assertIsNone(comp(out, "completion"))

	def test_no_todos_drops_completion_and_timeliness(self):
		out = score(todos=[])
		self.assertIsNone(comp(out, "completion"))
		self.assertIsNone(comp(out, "timeliness"))


class TestTimeliness(unittest.TestCase):
	def test_on_the_deadline_counts_as_on_time(self):
		out = score(todos=[done("2026-08-10", "2026-08-10")])
		self.assertEqual(comp(out, "timeliness")["value"], 100.0)

	def test_one_day_late_is_late(self):
		out = score(todos=[done("2026-08-10", "2026-08-11")])
		self.assertEqual(comp(out, "timeliness")["value"], 0.0)

	def test_completed_without_a_deadline_is_not_judged_on_time(self):
		# Nothing to be late against -> excluded from the denominator entirely.
		out = score(todos=[done(None, "2026-08-11"), done("2026-08-10", "2026-08-09")])
		self.assertEqual(comp(out, "timeliness")["detail"], "1/1")
		self.assertEqual(comp(out, "timeliness")["value"], 100.0)

	def test_completed_without_a_done_date_is_not_judged(self):
		out = score(todos=[done("2026-08-10", None)])
		self.assertIsNone(comp(out, "timeliness"))

	def test_unfinished_todos_never_reach_timeliness(self):
		out = score(todos=[todo(deadline="2026-01-01")])
		self.assertIsNone(comp(out, "timeliness"))

	def test_datetime_done_on_still_compares_by_date(self):
		out = score(todos=[done("2026-08-10", "2026-08-10 23:59:00")])
		self.assertEqual(comp(out, "timeliness")["value"], 100.0)


class TestDroppedComponents(unittest.TestCase):
	def test_no_courses_enrolled_is_dropped_not_zero(self):
		out = score(courses={"enrolled": 0, "completed": 0})
		self.assertIsNone(comp(out, "learning"))
		# The other four are all perfect, so dropping learning must still give 100 —
		# not 90, which is what scoring the missing component as zero would give.
		self.assertEqual(out["auto_score"], 100.0)

	def test_no_scheduled_days_drops_attendance(self):
		out = score(attendance={"scheduled": 0, "present": 0})
		self.assertIsNone(comp(out, "attendance"))
		self.assertEqual(out["auto_score"], 100.0)

	def test_no_point_target_drops_contribution(self):
		out = score(points={"earned": 40, "target": 0})
		self.assertIsNone(comp(out, "contribution"))
		self.assertEqual(out["auto_score"], 100.0)

	def test_weights_are_renormalised_over_survivors(self):
		# Only completion (30) and attendance (20) survive. 100% and 0% ->
		# 30/(30+20) = 60, not 30/100 = 30.
		out = score(
			todos=[done()],
			attendance={"scheduled": 4, "present": 0},
			points={"earned": 0, "target": 0},
			courses={"enrolled": 0, "completed": 0},
		)
		self.assertEqual(len(out["components"]), 2)
		self.assertEqual(out["auto_score"], 60.0)

	def test_nothing_at_all_scores_none_not_zero(self):
		out = compute_auto_score(
			todos=[], attendance={"scheduled": 0, "present": 0},
			points={"earned": 0, "target": 0}, courses={"enrolled": 0, "completed": 0})
		self.assertIsNone(out["auto_score"])
		self.assertIsNone(out["grade"])
		self.assertEqual(out["components"], [])

	def test_missing_dicts_are_treated_as_absent(self):
		out = compute_auto_score(todos=None, attendance=None, points=None, courses=None)
		self.assertIsNone(out["auto_score"])


class TestDeliveredWork(unittest.TestCase):
	"""An intern who delivered is not punished for the leader's unread inbox. Work sitting
	in Done / Checked By PL is the intern's part finished; only the review is outstanding."""

	def test_done_counts_as_the_interns_work_finished(self):
		out = score(todos=[todo(DELIVERED, "2026-08-10", "2026-08-09")])
		self.assertEqual(comp(out, "completion")["value"], 100.0)

	def test_checked_by_pl_counts_too(self):
		out = score(todos=[todo(CHECKED, "2026-08-10", "2026-08-09")])
		self.assertEqual(comp(out, "completion")["value"], 100.0)

	def test_delivered_work_is_judged_on_time_like_completed(self):
		out = score(todos=[todo(DELIVERED, "2026-08-10", "2026-08-12")])
		self.assertEqual(comp(out, "timeliness")["value"], 0.0)

	def test_planned_is_still_unfinished(self):
		out = score(todos=[todo(PLANNED), todo(DELIVERED, "2026-08-10", "2026-08-09")])
		self.assertEqual(comp(out, "completion")["value"], 50.0)

	def test_unknown_status_is_counted_as_unfinished_not_crashing(self):
		out = score(todos=[{"status": "🌈 Something New", "deadline": None, "done_on": None}])
		self.assertEqual(comp(out, "completion")["value"], 0.0)


class TestClamping(unittest.TestCase):
	def test_more_points_than_target_caps_at_100(self):
		out = score(points={"earned": 500, "target": 100})
		self.assertEqual(comp(out, "contribution")["value"], 100.0)
		self.assertEqual(out["auto_score"], 100.0)

	def test_more_present_than_scheduled_caps_at_100(self):
		out = score(attendance={"scheduled": 5, "present": 9})
		self.assertEqual(comp(out, "attendance")["value"], 100.0)

	def test_negative_points_floor_at_zero(self):
		out = score(points={"earned": -80, "target": 100})
		self.assertEqual(comp(out, "contribution")["value"], 0.0)

	def test_score_is_rounded_to_one_decimal(self):
		out = score(
			todos=[done(), done(), todo()],
			attendance={"scheduled": 3, "present": 1},
			points={"earned": 0, "target": 0},
			courses={"enrolled": 0, "completed": 0},
		)
		# completion 66.667 (w30), attendance 33.333 (w20) -> 53.333 -> 53.3
		self.assertEqual(out["auto_score"], 53.3)


class TestGrades(unittest.TestCase):
	def test_band_boundaries_are_inclusive(self):
		self.assertEqual(grade_for(85), "A")
		self.assertEqual(grade_for(84.9), "B")
		self.assertEqual(grade_for(70), "B")
		self.assertEqual(grade_for(69.9), "C")
		self.assertEqual(grade_for(55), "C")
		self.assertEqual(grade_for(54.9), "D")
		self.assertEqual(grade_for(0), "D")

	def test_grade_of_nothing_is_nothing(self):
		self.assertIsNone(grade_for(None))

	def test_bands_are_ordered_high_to_low(self):
		cuts = [c for c, _ in GRADE_BANDS]
		self.assertEqual(cuts, sorted(cuts, reverse=True))


class TestRubric(unittest.TestCase):
	def _rows(self, *scores):
		return [{"label": lbl, "weight": w, "score": s}
			for (_, lbl, w), s in zip(RUBRIC, scores)]

	def test_all_perfect(self):
		self.assertEqual(compute_rubric_score(self._rows(100, 100, 100, 100, 100)), 100.0)

	def test_all_zero(self):
		self.assertEqual(compute_rubric_score(self._rows(0, 0, 0, 0, 0)), 0.0)

	def test_weighted_not_plain_mean(self):
		# Kualitas Kerja carries 30 of the 100; scoring only it should not read as 20%.
		rows = [{"label": lbl, "weight": w, "score": (100 if k == "quality" else 0)}
			for k, lbl, w in RUBRIC]
		self.assertEqual(compute_rubric_score(rows), 30.0)

	def test_unscored_lines_are_ignored_not_zero(self):
		rows = self._rows(80, None, None, None, None)
		self.assertEqual(compute_rubric_score(rows), 80.0)

	def test_empty_rubric_is_none(self):
		self.assertIsNone(compute_rubric_score([]))
		self.assertIsNone(compute_rubric_score(None))

	def test_all_lines_unscored_is_none(self):
		self.assertIsNone(compute_rubric_score(self._rows(None, None, None, None, None)))

	def test_weights_need_not_sum_to_100(self):
		rows = [{"label": "a", "weight": 1, "score": 100}, {"label": "b", "weight": 3, "score": 0}]
		self.assertEqual(compute_rubric_score(rows), 25.0)

	def test_zero_weight_lines_are_ignored(self):
		rows = [{"label": "a", "weight": 0, "score": 100}, {"label": "b", "weight": 2, "score": 40}]
		self.assertEqual(compute_rubric_score(rows), 40.0)

	def test_all_zero_weight_is_none(self):
		self.assertIsNone(compute_rubric_score([{"label": "a", "weight": 0, "score": 100}]))

	def test_scores_are_clamped(self):
		self.assertEqual(compute_rubric_score([{"label": "a", "weight": 1, "score": 500}]), 100.0)
		self.assertEqual(compute_rubric_score([{"label": "a", "weight": 1, "score": -5}]), 0.0)

	def test_string_numbers_survive_the_json_round_trip(self):
		# Rubric rows come back from the browser as strings often enough to matter.
		rows = [{"label": "a", "weight": "2", "score": "90"}]
		self.assertEqual(compute_rubric_score(rows), 90.0)


class TestSplitGrade(unittest.TestCase):
	def test_two_scores_stay_apart(self):
		out = split_grade(90, 60)
		self.assertEqual(out["auto_grade"], "A")
		self.assertEqual(out["rubric_grade"], "C")
		self.assertNotIn("combined_score", out)

	def test_missing_half_is_tolerated(self):
		self.assertEqual(split_grade(None, 90)["rubric_grade"], "A")
		self.assertIsNone(split_grade(None, 90)["auto_grade"])
		self.assertIsNone(split_grade(90, None)["rubric_grade"])


if __name__ == "__main__":
	unittest.main()
