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


def leaders_for_projects(projects, employee):
	"""Advisory leaders for `employee`'s request, from the Ongoing projects they
	are in, given as [(project_owner, project_leader), ...].

	A project owner outranks every project leader, so owning any of the projects
	they are in drops the whole list: the request skips leader input entirely and
	goes straight to HR, who decide it either way.
	"""
	if any(owner == employee for owner, _leader in projects):
		return []
	return distinct_leaders([leader for _owner, leader in projects], employee)


if __name__ == "__main__":
	assert distinct_leaders(["a", "a", "b", None, ""], "z") == ["a", "b"]
	assert distinct_leaders(["a", "z", "b"], "z") == ["a", "b"]  # self excluded
	assert distinct_leaders([], "z") == []

	# Not an owner anywhere -> every leader still reviews.
	assert leaders_for_projects([("o1", "a"), ("o2", "b"), ("o3", "a")], "z") == ["a", "b"]
	# Owner of one project he is in -> no leader at all, not just that project's.
	assert leaders_for_projects([("z", "a"), ("o2", "b")], "z") == []
	# Owner-and-leader of his own project, member elsewhere -> still none.
	assert leaders_for_projects([("z", "z"), ("o2", "b")], "z") == []
	assert leaders_for_projects([], "z") == []
	print("approval.py self-check OK")
