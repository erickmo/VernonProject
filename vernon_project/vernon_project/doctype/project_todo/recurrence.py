# Copyright (c) 2026, Vernon and contributors
# Pure, frappe-free recurrence date math for Project Todo.
# Tests: python -m vernon_project.vernon_project.doctype.project_todo.test_recurrence
from __future__ import annotations

import calendar
import json
from dataclasses import dataclass
from datetime import date, timedelta

_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]  # ISO Mon=0..Sun=6
_IDX = {c: i for i, c in enumerate(_CODES)}
_NTH = {"First": 1, "Second": 2, "Third": 3, "Fourth": 4, "Last": -1}


def parse_weekdays(csv):
    if not csv:
        return []
    out = set()
    for tok in str(csv).split(","):
        t = tok.strip().upper()
        if not t:
            continue
        if t not in _IDX:
            raise ValueError(f"Unknown weekday: {tok!r}")
        out.add(_IDX[t])
    return sorted(out)


def format_weekdays(idxs):
    return ",".join(_CODES[i] for i in sorted(set(idxs)))


def parse_monthdays(csv):
    """CSV of month-days -> sorted unique list[int], each 1..31. Raises ValueError
    on a non-integer token or an out-of-range day."""
    if not csv:
        return []
    out = set()
    for tok in str(csv).split(","):
        t = tok.strip()
        if not t:
            continue
        n = int(t)  # raises ValueError on non-int
        if n < 1 or n > 31:
            raise ValueError(f"Month day out of range: {n}")
        out.add(n)
    return sorted(out)


def _as_date(v):
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def parse_ranges(value):
    """value: JSON string OR list of {"from","to"}. -> list[(date, date)].
    Single date (missing/blank "to") -> (d, d). Blank rows skipped. from > to swapped."""
    if not value:
        return []
    if isinstance(value, str):
        value = json.loads(value)
    out = []
    for row in value or []:
        if not row:
            continue
        frm = row.get("from")
        to = row.get("to")
        if not frm:
            continue
        a = _as_date(frm)
        b = _as_date(to) if to else a
        if a > b:
            a, b = b, a
        out.append((a, b))
    return out


@dataclass
class Exceptions:
    weekdays: tuple = ()     # ISO idx (Mon=0)
    monthdays: tuple = ()    # 1..31
    ranges: tuple = ()       # ((date, date), ...)
    behavior: str = "Skip"   # Skip | Shift

    def blocks(self, d):
        if d.weekday() in self.weekdays:
            return True
        if d.day in self.monthdays:
            return True
        return any(a <= d <= b for a, b in self.ranges)


@dataclass
class Rule:
    frequency: str
    interval: int = 1
    weekdays: tuple = ()
    monthly_mode: str = "Day of Month"
    day_of_month: "int | None" = None
    nth: str = "First"

    def normalized(self):
        return Rule(
            frequency=self.frequency,
            interval=max(1, int(self.interval or 1)),
            weekdays=tuple(sorted(set(self.weekdays or ()))),
            monthly_mode=self.monthly_mode or "Day of Month",
            day_of_month=(int(self.day_of_month) if self.day_of_month else None),
            nth=self.nth or "First",
        )


def _dim(y, m):
    return calendar.monthrange(y, m)[1]


def _add_months(y, m, n):
    idx = (m - 1) + n
    return y + idx // 12, idx % 12 + 1


def _nth_weekday(y, m, weekday, nth):
    n = _NTH[nth]
    if n == -1:
        d = date(y, m, _dim(y, m))
        return d - timedelta(days=(d.weekday() - weekday) % 7)
    first = date(y, m, 1)
    return first + timedelta(days=((weekday - first.weekday()) % 7) + 7 * (n - 1))


def _weekly(frm, r):
    wds = sorted(set(r.weekdays)) or [frm.weekday()]
    for wd in wds:
        cand = frm + timedelta(days=(wd - frm.weekday()))
        if cand > frm:  # strictly after, same ISO week
            return cand
    monday = frm - timedelta(days=frm.weekday())
    return (monday + timedelta(days=7 * r.interval)) + timedelta(days=wds[0])


def _monthly_day(frm, r):
    y, m = _add_months(frm.year, frm.month, r.interval)
    anchor = r.day_of_month or frm.day
    return date(y, m, min(anchor, _dim(y, m)))


def _monthly_nth(frm, r):
    y, m = _add_months(frm.year, frm.month, r.interval)
    wd = r.weekdays[0] if r.weekdays else frm.weekday()
    return _nth_weekday(y, m, wd, r.nth)


def next_occurrence(from_deadline, rule):
    r = rule.normalized()
    if r.frequency == "Daily":
        return from_deadline + timedelta(days=r.interval)
    if r.frequency == "Weekly":
        return _weekly(from_deadline, r)
    if r.frequency == "Monthly":
        return _monthly_nth(from_deadline, r) if r.monthly_mode == "Nth Weekday" else _monthly_day(from_deadline, r)
    return None


def first_on_or_after(day, rule):
    """First rule-matching date on/after `day` (ignores interval phase; used on resume)."""
    r = rule.normalized()
    if r.frequency == "Daily":
        return day
    if r.frequency == "Weekly":
        wds = sorted(set(r.weekdays)) or [day.weekday()]
        for i in range(7):
            d = day + timedelta(days=i)
            if d.weekday() in wds:
                return d
    if r.frequency == "Monthly":
        y, m = day.year, day.month
        for _ in range(2):
            if r.monthly_mode == "Nth Weekday":
                wd = r.weekdays[0] if r.weekdays else day.weekday()
                d = _nth_weekday(y, m, wd, r.nth)
            else:
                anchor = r.day_of_month or day.day
                d = date(y, m, min(anchor, _dim(y, m)))
            if d >= day:
                return d
            y, m = _add_months(y, m, 1)
    return day


def advance_while_blocked(start, step, blocked, until=None, bound=40):
    """Advance `start` over blocked days, for the recurrence skip/shift rule.

    step:    date -> next candidate (Skip: rule's next_occurrence; Shift: +1 day).
    blocked: date -> bool (True = this date can't host an occurrence).
    until:   inclusive series end, or None. bound: max candidates scanned.

    Returns the first candidate that is NOT blocked; None if `until` is passed before
    any open day (series is over); or the original `start` if every candidate within
    `bound` steps is blocked (degenerate config — keep the date so the series is never
    silently dropped). bound=40 so a multi-week vacation range survives Shift stepping.
    """
    candidate = start
    for _ in range(bound):
        if until is not None and candidate > until:
            return None
        if not blocked(candidate):
            return candidate
        candidate = step(candidate)
    return start


def advance_over_zero_days(start, step, min_for, until=None, bound=40):
    """Back-compat wrapper: block days whose minimum-minutes is <= 0."""
    return advance_while_blocked(start, step, lambda d: min_for(d) <= 0, until, bound)
