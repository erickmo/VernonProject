# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Pure approval logic for Attendance Exception multi-leader gate. No frappe /
# DB imports here on purpose — keeps it unit-testable via `python approval.py`.


def derive_status(decisions):
	"""Overall exception status from a list of per-leader decision strings.

	Unanimity both ways (matches spec): all approve -> Approved, all reject ->
	Rejected, empty set -> Approved (auto-approve, no leaders), anything mixed
	or still pending -> Pending.
	"""
	if not decisions:
		return "Approved"
	if all(d == "Approved" for d in decisions):
		return "Approved"
	if all(d == "Rejected" for d in decisions):
		return "Rejected"
	return "Pending"


def distinct_leaders(leaders, employee):
	"""Order-preserving distinct leaders, excluding the requester and falsy."""
	seen = []
	for leader in leaders:
		if leader and leader != employee and leader not in seen:
			seen.append(leader)
	return seen


if __name__ == "__main__":
	assert derive_status([]) == "Approved"
	assert derive_status(["Approved", "Approved"]) == "Approved"
	assert derive_status(["Rejected", "Rejected"]) == "Rejected"
	assert derive_status(["Approved", "Rejected"]) == "Pending"
	assert derive_status(["Approved", "Pending"]) == "Pending"
	assert derive_status(["Rejected", "Pending"]) == "Pending"
	assert distinct_leaders(["a", "a", "b", None, ""], "z") == ["a", "b"]
	assert distinct_leaders(["a", "z", "b"], "z") == ["a", "b"]  # self excluded
	assert distinct_leaders([], "z") == []
	print("approval.py self-check OK")
