"""Site-less unit check: the Home 'Done' tab is ordered by real done time.

Runs without a Frappe site -- _sort_recently_done / _done_time are pure functions
over the rows _fetch_todos returns, so plain dicts are enough. No DB, no fixtures.
"""
from datetime import date, datetime

from vernon_project.api.project_todo import DONE_WINDOW_DAYS, _done_since, _done_time, _sort_recently_done


def _row(name, developed_at=None, done_started_at=None, completed_at=None, modified=None):
	return {
		"name": name,
		"developed_at": developed_at,
		"done_started_at": done_started_at,
		"completed_at": completed_at,
		"modified": modified or datetime(2026, 1, 1),
	}


def _dt(day, hour=0):
	return datetime(2026, 9, day, hour)


def test_orders_by_done_time_not_approval_time():
	# The whole point: b was finished LAST but approved FIRST. Done time wins.
	a = _row("a", developed_at=_dt(1), completed_at=_dt(9))
	b = _row("b", developed_at=_dt(5), completed_at=_dt(8))
	assert [r["name"] for r in _sort_recently_done([a, b], 30)] == ["b", "a"]


def test_newest_done_first():
	rows = [_row(str(d), developed_at=_dt(d)) for d in (2, 5, 1, 4, 3)]
	assert [r["name"] for r in _sort_recently_done(rows, 30)] == ["5", "4", "3", "2", "1"]


def test_falls_back_when_developed_at_missing():
	# auto-advanced legacy rows can lack developed_at; they must still be placed.
	assert _done_time(_row("x", done_started_at=_dt(3), completed_at=_dt(9))) == _dt(3)
	assert _done_time(_row("x", completed_at=_dt(9))) == _dt(9)
	assert _done_time(_row("x")) is None


def test_row_with_no_done_time_sorts_last_and_is_kept():
	rows = [_row("none"), _row("has", developed_at=_dt(1))]
	assert [r["name"] for r in _sort_recently_done(rows, 30)] == ["has", "none"]


def test_tie_break_is_deterministic():
	same = _dt(4, 9)
	rows = [
		_row("a", developed_at=same, modified=_dt(4, 10)),
		_row("b", developed_at=same, modified=_dt(4, 11)),
		_row("c", developed_at=same, modified=_dt(4, 10)),
	]
	order = [r["name"] for r in _sort_recently_done(rows, 30)]
	assert order == ["b", "c", "a"], order  # modified desc, then name desc
	assert order == [r["name"] for r in _sort_recently_done(list(reversed(rows)), 30)]


def test_limit_caps_after_sorting_not_before():
	rows = [_row(str(d), developed_at=_dt(d)) for d in (1, 2, 3, 4, 5)]
	assert [r["name"] for r in _sort_recently_done(rows, 2)] == ["5", "4"]


def test_done_window_is_today_and_the_two_days_before():
	# 8ek4eg7j87: "Done in the last 3 days" = 3 calendar days ending today.
	assert DONE_WINDOW_DAYS == 3
	assert _done_since("2026-09-11") == date(2026, 9, 9)
	assert _done_since("2026-03-01") == date(2026, 2, 27)  # month boundary


def test_no_limit_means_every_row():
	rows = [_row(str(i), developed_at=datetime(2026, 9, 11, 8, i)) for i in range(40)]
	assert len(_sort_recently_done(rows)) == 40


if __name__ == "__main__":
	for name, fn in sorted(globals().items()):
		if name.startswith("test_"):
			fn()
			print("ok", name)
