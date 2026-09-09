# Static pin for the 2026-09-07/08 money-path audit fix (create/write) and the
# 2026-09-09 follow-up (delete): no role except System Manager may hold
# `create`, `write`, or `delete` on Point Ledger -- every legitimate writer
# validates its own amount then inserts/saves/deletes with
# ignore_permissions=True (see grant_points, meeting.py, lms.py,
# attendance/engine.py, superpowers.py, tasks.py, project_todo.py). A role
# holding any of the three bypasses that validation: `create` via a direct
# insert, `write` by editing an existing row's points_earned directly
# (live-proved: a Group-Manager-only user raised an existing row from 10 to
# 999999 via doc.save() with no ignore_permissions), `delete` by erasing a
# row outright with no recompute/audit trail (Group Manager held this
# unconditionally, controller is a stub, no has_permission hook -- confirmed
# by direct source read in the 2026-09-09 permission sweep).
# Run: python3 check_no_create_role.py
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

if __name__ == "__main__":
	with open(os.path.join(HERE, "point_ledger.json")) as f:
		perms = json.load(f)["permissions"]
	creators = [p["role"] for p in perms if p.get("create")]
	writers = [p["role"] for p in perms if p.get("write")]
	deleters = [p["role"] for p in perms if p.get("delete")]
	assert creators == ["System Manager"], f"unexpected create-holders on Point Ledger: {creators}"
	assert writers == ["System Manager"], f"unexpected write-holders on Point Ledger: {writers}"
	assert deleters == ["System Manager"], f"unexpected delete-holders on Point Ledger: {deleters}"
	print("OK — only System Manager holds create/write/delete on Point Ledger:", creators)
