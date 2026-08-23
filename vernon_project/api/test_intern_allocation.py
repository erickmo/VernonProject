import unittest

from vernon_project.api.report import (
	STATUS_CHECKED, STATUS_COMPLETED, STATUS_DONE, STATUS_PLANNED,
	_build_daily_matrix, _build_intern_matrix, _weekday_dates,
)

# 2026-08-17 is a Monday, so 22 = Saturday and 23 = Sunday.
WEEK = ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"]


def _matrix(users, assigned, threshold=0):
	return _build_daily_matrix(users, assigned, [], WEEK[0], WEEK[-1], threshold)


def _todo(user="budi@x.id", **kw):
	row = {
		"user": user, "project": "PROJ-1", "project_name": "Website",
		"leader": "sinta@x.id", "leader_name": "Sinta", "status": STATUS_PLANNED,
		"deadline": None, "done_on": None, "review_since": None,
		"minutes": 60, "in_range": True,
	}
	row.update(kw)
	return row


class TestWeekdayDates(unittest.TestCase):
	def test_drops_saturday_and_sunday(self):
		self.assertEqual(_weekday_dates(WEEK), WEEK[:5])

	def test_empty(self):
		self.assertEqual(_weekday_dates([]), [])


class TestBuildInternMatrix(unittest.TestCase):
	def _run(self, assigned=(), todos=(), notes=(), sources=("member_type",), scope="all"):
		users = [{"name": "budi@x.id", "full_name": "Budi"}]
		interns = [{"name": "budi@x.id", "full_name": "Budi", "sources": list(sources)}]
		out = _build_intern_matrix(_matrix(users, list(assigned)), interns, list(todos), list(notes), scope)
		return out, out["rows"][0]

	def test_no_work_at_all_is_idle(self):
		out, row = self._run()
		self.assertEqual(row["zero_days"], 5)           # 5 weekdays, none worked
		self.assertIsNone(row["last_assigned_on"])
		self.assertEqual(row["stale_days"], len(WEEK))  # never assigned -> whole range
		self.assertTrue(row["attention"])
		self.assertIn("idle", row["reasons"])
		self.assertEqual(out["totals"], {"interns": 1, "attention": 1})
		self.assertEqual(out["scope"], "all")

	def test_weekend_only_work_still_counts_as_idle(self):
		_, row = self._run(assigned=[{"user": "budi@x.id", "day": "2026-08-22", "minutes": 300}])
		self.assertEqual(row["zero_days"], 5)
		self.assertIn("idle", row["reasons"])
		self.assertEqual(row["last_assigned_on"], "2026-08-22")

	def test_last_assigned_and_stale_days(self):
		_, row = self._run(assigned=[{"user": "budi@x.id", "day": "2026-08-19", "minutes": 120}])
		self.assertEqual(row["last_assigned_on"], "2026-08-19")
		self.assertEqual(row["stale_days"], 4)      # to_date 08-23 minus 08-19
		self.assertEqual(row["zero_days"], 4)
		self.assertNotIn("stale", row["reasons"])   # 4 < STALE_ASSIGNMENT_DAYS

	def test_full_week_of_work_needs_no_attention(self):
		assigned = [{"user": "budi@x.id", "day": d, "minutes": 180} for d in WEEK[:5]]
		_, row = self._run(assigned=assigned)
		self.assertEqual(row["zero_days"], 0)
		self.assertFalse(row["attention"])
		self.assertEqual(row["reasons"], [])

	def test_awaiting_review_counts_and_oldest_wait(self):
		todos = [
			_todo(status=STATUS_DONE, review_since="2026-08-20"),
			_todo(status=STATUS_CHECKED, review_since="2026-08-14"),
			_todo(status=STATUS_COMPLETED, done_on="2026-08-18"),
		]
		assigned = [{"user": "budi@x.id", "day": d, "minutes": 180} for d in WEEK[:5]]
		_, row = self._run(assigned=assigned, todos=todos)
		self.assertEqual(row["awaiting_review"], 2)
		self.assertEqual(row["oldest_wait_days"], 9)   # 08-23 minus 08-14
		self.assertTrue(row["attention"])
		self.assertIn("waiting", row["reasons"])

	def test_wait_boundary(self):
		assigned = [{"user": "budi@x.id", "day": d, "minutes": 180} for d in WEEK[:5]]
		_, two = self._run(assigned=assigned, todos=[_todo(status=STATUS_DONE, review_since="2026-08-21")])
		self.assertEqual(two["oldest_wait_days"], 2)
		self.assertNotIn("waiting", two["reasons"])
		_, three = self._run(assigned=assigned, todos=[_todo(status=STATUS_DONE, review_since="2026-08-20")])
		self.assertEqual(three["oldest_wait_days"], 3)
		self.assertIn("waiting", three["reasons"])

	def test_done_and_late_counts(self):
		todos = [
			_todo(status=STATUS_COMPLETED, done_on="2026-08-19", deadline="2026-08-20"),  # early
			_todo(status=STATUS_COMPLETED, done_on="2026-08-21", deadline="2026-08-19"),  # late
			_todo(status=STATUS_PLANNED, deadline="2026-08-21"),                          # not done
		]
		_, row = self._run(todos=todos)
		self.assertEqual(row["assigned_count"], 3)
		self.assertEqual(row["done"], 2)
		self.assertEqual(row["late"], 1)

	def test_out_of_range_waiting_todo_does_not_inflate_counts(self):
		# A todo delivered long before the window and still unreviewed: it MUST show as
		# waiting (that is the abuse HR looks for) but must not count as this window's work.
		todos = [_todo(status=STATUS_DONE, review_since="2026-07-01", in_range=False)]
		_, row = self._run(todos=todos)
		self.assertEqual(row["awaiting_review"], 1)
		self.assertEqual(row["assigned_count"], 0)

	def test_project_split_carries_leader(self):
		todos = [
			_todo(minutes=60), _todo(minutes=30),
			_todo(project="PROJ-2", project_name="App", leader="rendi@x.id", leader_name="Rendi", minutes=90),
		]
		_, row = self._run(todos=todos)
		by_name = {p["project"]: p for p in row["projects"]}
		self.assertEqual(by_name["PROJ-1"]["todos"], 2)
		self.assertEqual(by_name["PROJ-1"]["minutes"], 90)
		self.assertEqual(by_name["PROJ-1"]["leader_name"], "Sinta")
		self.assertEqual(by_name["PROJ-2"]["leader_name"], "Rendi")
		self.assertEqual(row["leaders"], [
			{"leader": "rendi@x.id", "leader_name": "Rendi"},
			{"leader": "sinta@x.id", "leader_name": "Sinta"},
		])

	def test_notes_counted_in_range_only(self):
		_, row = self._run(notes=[{"user": "budi@x.id", "note_date": "2026-08-18"},
			{"user": "budi@x.id", "note_date": "2026-08-20"}])
		self.assertEqual(row["notes_count"], 2)
		self.assertEqual(row["last_note_on"], "2026-08-20")

	def test_no_notes(self):
		_, row = self._run()
		self.assertEqual(row["notes_count"], 0)
		self.assertIsNone(row["last_note_on"])

	def test_sources_passed_through(self):
		_, row = self._run(sources=("member_type", "profile"))
		self.assertEqual(row["sources"], ["member_type", "profile"])

	def test_other_users_rows_are_ignored(self):
		_, row = self._run(todos=[_todo(user="someone@x.id", status=STATUS_DONE, review_since="2026-08-01")])
		self.assertEqual(row["awaiting_review"], 0)
		self.assertEqual(row["projects"], [])

	def test_attention_rows_sort_first(self):
		users = [{"name": "a@x.id", "full_name": "Ayu"}, {"name": "b@x.id", "full_name": "Budi"}]
		interns = [{"name": u["name"], "full_name": u["full_name"], "sources": ["member_type"]} for u in users]
		# Ayu worked every weekday; Budi did nothing -> Budi needs attention and sorts first.
		assigned = [{"user": "a@x.id", "day": d, "minutes": 180} for d in WEEK[:5]]
		out = _build_intern_matrix(_matrix(users, assigned), interns, [], [], "all")
		self.assertEqual([r["user"] for r in out["rows"]], ["b@x.id", "a@x.id"])
		self.assertEqual(out["totals"], {"interns": 2, "attention": 1})
