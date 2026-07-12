"""Site-less unit check for _auto_advance's auto_approve Owner-gate skip.

Runs without a Frappe site: we only need _auto_advance (pure mutation) and a
stubbed frappe.utils.now. No DB, no fixtures.
"""
import types

import frappe
frappe.utils.now = lambda: "2026-07-11 00:00:00"

from vernon_project.api.project_todo import _auto_advance


def _todo(**kw):
	base = dict(status="🔷 Checked By PL", auto_approve=0, assigned_to=None,
	            tested_at="2026-07-11 00:00:00", completed_at=None, completed_by=None)
	base.update(kw)
	return types.SimpleNamespace(**base)


def test_auto_approve_completes():
	# Case 1: flag set -> Owner gate skipped, completes stamped to the owner.
	todo = _todo(auto_approve=1)
	_auto_advance(todo, project_leader="leader@x", project_owner="owner@x")
	assert todo.status == "✅ Completed"
	assert todo.completed_by == "owner@x"


def test_no_flag_leader_ne_owner_stays():
	# Case 2: no flag and leader != owner -> Owner gate holds.
	todo = _todo(auto_approve=0)
	_auto_advance(todo, project_leader="leader@x", project_owner="owner@x")
	assert todo.status == "🔷 Checked By PL"


def test_flag_but_no_owner_stays():
	# Case 3: flag set but no real owner -> no phantom complete.
	todo = _todo(auto_approve=1)
	_auto_advance(todo, project_leader="leader@x", project_owner=None)
	assert todo.status == "🔷 Checked By PL"


if __name__ == "__main__":
	test_auto_approve_completes()
	test_no_flag_leader_ne_owner_stays()
	test_flag_but_no_owner_stays()
	print("ok")
