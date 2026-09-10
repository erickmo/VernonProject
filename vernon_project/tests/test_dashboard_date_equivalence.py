"""Site-less unit check for get_dashboard's raw-vs-stringified deadline comparison.

get_dashboard used to compare getdate(shaped["deadline"]) -- a STRING that _shape_todo
built with str(r["deadline"]) -- against today. It now compares getdate(r["deadline"]),
the date object straight off the SQL row, which is ~684x cheaper (181us vs 0.26us a call
on this box: getdate() dateutil-parses a string, and just returns a date unchanged).

The swap is only safe if two things hold for every value the column can carry, so this
asserts both. If either breaks, get_dashboard silently mis-buckets todos between the
overdue / due-today / upcoming lists.
"""
from datetime import date, datetime

from frappe.utils import getdate

# The shaper's own expression, mirrored so the test breaks if it ever changes shape.
def _shaped_deadline(raw):
	return str(raw) if raw else None


CASES = [
	date(2026, 9, 10),
	date(2026, 1, 1),
	date(2026, 12, 31),
	date(2024, 2, 29),            # leap day
	datetime(2026, 9, 10, 0, 0),  # if the column ever widens to Datetime
	datetime(2026, 9, 10, 23, 59, 59),
]


def test_getdate_agrees_on_raw_and_stringified():
	"""getdate(str(d)) == getdate(d) — the comparison result cannot change."""
	for raw in CASES:
		assert getdate(_shaped_deadline(raw)) == getdate(raw), raw


def test_truthiness_guard_agrees():
	"""`r["deadline"]` and `shaped["deadline"]` are falsy together, so swapping the
	guard cannot let a None through or drop a real date."""
	for raw in CASES + [None]:
		assert bool(raw) == bool(_shaped_deadline(raw)), raw


def test_empty_deadline_never_reaches_getdate():
	"""A missing deadline must be filtered by the guard, not parsed.

	Frappe's getdate(None) returns TODAY, so an unguarded call would file every
	undated todo into due_today — which is why both call sites keep the
	`and r["deadline"]` guard in front. Not asserted here: getdate(None) reaches
	now_datetime() -> system timezone -> System Settings, which needs a live site,
	and this file is deliberately site-less.
	"""
	assert _shaped_deadline(None) is None


if __name__ == "__main__":
	for name, fn in sorted(globals().items()):
		if name.startswith("test_"):
			fn()
			print("ok", name)
