"""Site-less unit check for _auto_advance's auto_approve Owner-gate skip.

Runs without a Frappe site: we only need _auto_advance (pure mutation) and a
stubbed frappe.utils.now. No DB, no fixtures.
"""
import types

import frappe
frappe.utils.now = lambda: "2026-07-11 00:00:00"

from vernon_project.api.project_todo import _auto_advance


def _todo(**kw):
	base = dict(status="🔷 Checked By PL", auto_approve=0, auto_approve_opt_out=0,
	            assigned_to=None, tested_at="2026-07-11 00:00:00",
	            completed_at=None, completed_by=None)
	base.update(kw)
	return types.SimpleNamespace(**base)


def test_todo_force_on_completes():
	todo = _todo(auto_approve=1)
	_auto_advance(todo, "leader@x", "owner@x", 0)
	assert todo.status == "✅ Completed"
	assert todo.completed_by == "owner@x"


def test_no_flags_leader_ne_owner_stays():
	todo = _todo()
	_auto_advance(todo, "leader@x", "owner@x", 0)
	assert todo.status == "🔷 Checked By PL"


def test_force_on_but_no_owner_stays():
	todo = _todo(auto_approve=1)
	_auto_advance(todo, "leader@x", None, 0)
	assert todo.status == "🔷 Checked By PL"


def test_project_default_inherit_completes():
	# project default ON, todo inherits -> completes
	todo = _todo()
	_auto_advance(todo, "leader@x", "owner@x", 1)
	assert todo.status == "✅ Completed"


def test_project_default_but_todo_opts_out_stays():
	# project default ON, todo forces OFF -> stays
	todo = _todo(auto_approve_opt_out=1)
	_auto_advance(todo, "leader@x", "owner@x", 1)
	assert todo.status == "🔷 Checked By PL"


def test_project_off_todo_on_completes():
	# project default OFF, todo forces ON -> completes
	todo = _todo(auto_approve=1)
	_auto_advance(todo, "leader@x", "owner@x", 0)
	assert todo.status == "✅ Completed"


def test_project_default_inherit_no_owner_stays():
	# project default ON, inherit, but no real owner -> truthiness guard holds
	todo = _todo()
	_auto_advance(todo, "leader@x", None, 1)
	assert todo.status == "🔷 Checked By PL"


if __name__ == "__main__":
	for fn in list(globals().values()):
		if callable(fn) and getattr(fn, "__name__", "").startswith("test_"):
			fn()
	print("ok")
