# Copyright (c) 2026, Vernon and contributors
# Standalone (no-site) check of recurrence date math.
# Run: cd apps/vernon_project && python -m vernon_project.vernon_project.doctype.project_todo.test_recurrence
from datetime import date, timedelta

from vernon_project.vernon_project.doctype.project_todo.recurrence import (
    Rule, next_occurrence, first_on_or_after, parse_weekdays, format_weekdays,
    advance_over_zero_days,
)

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)


def _r(**kw):
    return Rule(**kw)


def test_parse_weekdays():
    assert parse_weekdays("") == []
    assert parse_weekdays(None) == []
    assert parse_weekdays("thu,mon") == [MON, THU]
    assert parse_weekdays("MON, MON ,thu") == [MON, THU]
    assert format_weekdays([THU, MON]) == "MON,THU"
    try:
        parse_weekdays("FUN"); assert False
    except ValueError:
        pass


def test_daily():
    assert next_occurrence(date(2026, 7, 5), _r(frequency="Daily")) == date(2026, 7, 6)
    assert next_occurrence(date(2026, 7, 5), _r(frequency="Daily", interval=3)) == date(2026, 7, 8)


def test_weekly_legacy_plus7_all_start_days():
    # Empty weekdays must collapse to +7*interval for every start weekday incl Sunday.
    for start in range(7):
        d = date(2026, 7, 6 + start)  # 2026-07-06 is a Monday
        assert next_occurrence(d, _r(frequency="Weekly")) == date(2026, 7, 13 + start)
        assert next_occurrence(d, _r(frequency="Weekly", interval=2)) == date(2026, 7, 20 + start)


def test_weekly_strictly_after():
    # from_deadline lands on a selected weekday -> next must NOT equal it.
    d = date(2026, 7, 6)  # Monday
    n = next_occurrence(d, _r(frequency="Weekly", weekdays=(MON, THU)))
    assert n == date(2026, 7, 9) and n != d  # Thu same week


def test_weekly_multiweekday_interval2_no_dropped_days():
    # Mon+Thu every 2 weeks: Mon, Thu, (skip a week), Mon, Thu — no Monday dropped.
    r = _r(frequency="Weekly", weekdays=(MON, THU), interval=2)
    d = date(2026, 7, 6)  # Mon w0
    d = next_occurrence(d, r); assert d == date(2026, 7, 9)   # Thu w0
    d = next_occurrence(d, r); assert d == date(2026, 7, 20)  # Mon w2
    d = next_occurrence(d, r); assert d == date(2026, 7, 23)  # Thu w2
    d = next_occurrence(d, r); assert d == date(2026, 8, 3)   # Mon w4


def test_monthly_day_of_month_fixed_anchor_restores():
    r = _r(frequency="Monthly", day_of_month=31)
    d = date(2026, 1, 31)
    d = next_occurrence(d, r); assert d == date(2026, 2, 28)  # clamp
    d = next_occurrence(d, r); assert d == date(2026, 3, 31)  # RESTORE to 31
    d = next_occurrence(d, r); assert d == date(2026, 4, 30)


def test_monthly_day_of_month_legacy_drifts():
    # Empty anchor: derives from occurrence deadline day (preserves old clamp-drift).
    r = _r(frequency="Monthly")
    d = date(2026, 1, 31)
    d = next_occurrence(d, r); assert d == date(2026, 2, 28)
    d = next_occurrence(d, r); assert d == date(2026, 3, 28)  # stuck on 28 (legacy)


def test_monthly_day_interval3():
    r = _r(frequency="Monthly", day_of_month=15, interval=3)
    assert next_occurrence(date(2026, 1, 15), r) == date(2026, 4, 15)


def test_monthly_nth_weekday():
    # 2nd Tuesday each month.
    r = _r(frequency="Monthly", monthly_mode="Nth Weekday", weekdays=(TUE,), nth="Second")
    assert next_occurrence(date(2026, 1, 13), r) == date(2026, 2, 10)
    # Last Friday.
    r2 = _r(frequency="Monthly", monthly_mode="Nth Weekday", weekdays=(FRI,), nth="Last")
    assert next_occurrence(date(2026, 1, 30), r2) == date(2026, 2, 27)
    # First/Third/Fourth share the ordinal formula path — exercise each (Feb 1 2026 = Sun).
    assert next_occurrence(date(2026, 1, 5), _r(frequency="Monthly", monthly_mode="Nth Weekday", weekdays=(MON,), nth="First")) == date(2026, 2, 2)
    assert next_occurrence(date(2026, 1, 21), _r(frequency="Monthly", monthly_mode="Nth Weekday", weekdays=(WED,), nth="Third")) == date(2026, 2, 18)
    assert next_occurrence(date(2026, 1, 23), _r(frequency="Monthly", monthly_mode="Nth Weekday", weekdays=(FRI,), nth="Fourth")) == date(2026, 2, 27)


def test_first_on_or_after():
    r = _r(frequency="Weekly", weekdays=(MON, THU))
    assert first_on_or_after(date(2026, 7, 7), r) == date(2026, 7, 9)  # Tue -> Thu
    rm = _r(frequency="Monthly", day_of_month=15)
    assert first_on_or_after(date(2026, 7, 20), rm) == date(2026, 8, 15)


def test_advance_over_zero_days():
    step = lambda d: d + timedelta(days=1)
    # Fri/Sat = 0, everything else 120. Start Fri -> first working day is Sun? no: Sun=120 here.
    mins = {SAT: 0, SUN: 0}  # weekday-indexed; others default 120
    min_for = lambda d: mins.get(d.weekday(), 120)
    # 2026-07-18 is a Saturday. Skip Sat(0), Sun(0) -> Mon 2026-07-20.
    assert advance_over_zero_days(date(2026, 7, 18), step, min_for) == date(2026, 7, 20)
    # Start on a working day -> returned unchanged.
    assert advance_over_zero_days(date(2026, 7, 20), step, min_for) == date(2026, 7, 20)
    # `until` passed before any working day -> None (series ended). Sat with until=that Sun.
    assert advance_over_zero_days(date(2026, 7, 18), step, min_for, until=date(2026, 7, 19)) is None
    # Degenerate: every day 0 -> keep the original start, never drop.
    assert advance_over_zero_days(date(2026, 7, 18), step, lambda d: 0) == date(2026, 7, 18)
    # Bound respected: only `bound` steps scanned before falling back to start.
    seen = []
    def counting(d):
        seen.append(d)
        return 0
    advance_over_zero_days(date(2026, 7, 18), step, counting, bound=3)
    assert len(seen) == 3


def _run():
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print(f"{name} ok")


if __name__ == "__main__":
    _run()
