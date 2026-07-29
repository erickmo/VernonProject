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
