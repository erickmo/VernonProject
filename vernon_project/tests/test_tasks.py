# Copyright (c) 2026, Vernon and contributors
# Standalone (no-site) check of the deadline-notification date logic.
# Run: cd apps/vernon_project && python -m vernon_project.test_tasks

from datetime import date, timedelta

from vernon_project.tasks import _due_message
from vernon_project.tests.collect import collect_module_tests


def test_due_message():
    today = date(2026, 6, 27)

    # Future deadline -> no nudge.
    assert _due_message("X", today + timedelta(days=1), today) is None
    assert _due_message("X", "2026-07-01", today) is None

    # Due today (accepts date and ISO string).
    t = _due_message("Write spec", today, today)
    assert t and t[0] == "Task due today" and "due today" in t[1], t
    assert _due_message("Write spec", "2026-06-27", today)[0] == "Task due today"

    # Overdue keeps the task label.
    o = _due_message("Write spec", today - timedelta(days=3), today)
    assert o and o[0] == "Task overdue" and "Write spec" in o[1], o

    # No deadline -> skip; blank label -> fallback.
    assert _due_message("X", None, today) is None
    f = _due_message("   ", today, today)
    assert f and "Your task" in f[1], f

    print("test_due_message ok")

# These are pytest-style bare functions and pytest is not installed in the bench env;
# Frappe's runner collects TestCase subclasses only, so without this line the file
# runs nowhere. A function added above is picked up with no edit here.
TestDueMessage = collect_module_tests(globals(), "TestDueMessage")

if __name__ == "__main__":
    test_due_message()
