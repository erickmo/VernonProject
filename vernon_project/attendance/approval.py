# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Pure approval logic for Attendance Exception. No frappe / DB imports here on
# purpose — keeps it unit-testable via `python approval.py`.
#
# There is no derive_status(): since 2026-07-15 HR is the final approver, and
# `status` is a straight mirror of `hr_decision` (same Select options), so the
# whole derivation is one assignment in api/attendance.py. Leader decisions are
# advisory and gate nothing.


def distinct_leaders(leaders, employee):
	"""Order-preserving distinct leaders, excluding the requester and falsy."""
	seen = []
	for leader in leaders:
		if leader and leader != employee and leader not in seen:
			seen.append(leader)
	return seen


if __name__ == "__main__":
	assert distinct_leaders(["a", "a", "b", None, ""], "z") == ["a", "b"]
	assert distinct_leaders(["a", "z", "b"], "z") == ["a", "b"]  # self excluded
	assert distinct_leaders([], "z") == []
	print("approval.py self-check OK")
