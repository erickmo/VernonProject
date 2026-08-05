"""Sweep must never delete today's or future plans, whatever grace an admin sets."""
from datetime import date

from vernon_project.tasks import _stale_plan_cutoff

TODAY = date(2026, 8, 5)


def test_cutoff_never_reaches_today_or_future():
    # grace 0 and negatives must not let cutoff touch today (a slot due today isn't past-due)
    for grace in (-5, 0, 1):
        assert _stale_plan_cutoff(TODAY, grace) < TODAY, grace
    assert _stale_plan_cutoff(TODAY, 1) == date(2026, 8, 4)
    assert _stale_plan_cutoff(TODAY, 3) == date(2026, 8, 2)


if __name__ == "__main__":
    test_cutoff_never_reaches_today_or_future()
    print("ok")
